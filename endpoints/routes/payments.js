// routes/payments.js (refactored to use common helpers)
import express from "express";
import { ENDPOINTS } from "../../public/endpoints.js";
import { printDebugMessage } from "../utils/debug.js";
import { validateCall, sendCall, handleSetCookies } from "../utils/common.js";
import { insertOrder, redirectToViewOrder } from "./common.js";

const router = express.Router();
const { ORDER: ORDER_PATH, PAYMENT_METHOD: PAYMENTMETHOD_PATH } = ENDPOINTS;

// POST /transaction -> Process payment transaction via AudienceView API
router.post("/transaction", express.json(), async (req, res) => {
  try {
    validateCall(req, [], ["ORDER_PATH"], "transaction");

    const { orderData } = req.body || {};
    const response = await insertOrder();
    await handleSetCookies(response);
    
    const raw = await response.text();
    let data; try { data = JSON.parse(raw); } catch { data = raw; }

    if (!response.ok) {
      printDebugMessage(`Transaction failed: ${response.status}`);
      return res.status(response.status).json({ success: false, error: "Transaction failed", details: data });
    }

    const orderNumber = data?.data?.["Order::order_number"]?.standard;
    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    var orderData = {
      orderNumber,
      transactionId,
      actionsJson: data,
      respJson: data,
      paymentMethod: "N/A"
    };
    printDebugMessage("Transaction completed successfully");
    return await redirectToViewOrder(orderData, res);

  } catch (err) {
    printDebugMessage(`Error in /transaction: ${err.message}`);
    res.status(500).json({ success: false, error: String(err?.message || err) });
  }
});


router.post("/checkout", express.json(), async (req, res) => {
  try {
    validateCall(req, ["deliveryMethod", "paymentMethod"], ["ORDER_PATH"], "checkout");
    const { deliveryMethod, paymentMethod } = req.body || {};

    // Step 1: addCustomer
    const addCustomerPayload = {
      actions: [{ method: "addCustomer", params: { "Customer::customer_number": "1" } }],
      get: ["Order::order_number", "Payments"],
      objectName: "myOrder"
    };
    const rCustomer = await sendCall(ORDER_PATH, addCustomerPayload);
    await handleSetCookies(rCustomer);
    const rawCustomer = await rCustomer.text();
    let dataCustomer; try { dataCustomer = JSON.parse(rawCustomer); } catch { dataCustomer = rawCustomer; }
    if (!rCustomer.ok) {
      printDebugMessage(`Checkout failed at addCustomer: ${rCustomer.status}`);
      return res.status(rCustomer.status).json({ error: "Checkout failed (addCustomer)", details: dataCustomer });
    }

    // Step 2: check Payments
    const checkPaymentsPayload = { get: ["Payments"], objectName: "myOrder" };
    const rCheck = await sendCall(ORDER_PATH, checkPaymentsPayload);
    await handleSetCookies(rCheck);
    const rawCheck = await rCheck.text();
    let dataCheck; try { dataCheck = JSON.parse(rawCheck); } catch { dataCheck = rawCheck; }
    let paymentsObj = dataCheck?.data?.Payments || {};
    let hasPayment = Object.values(paymentsObj).some(v => v?.payment_id?.standard);

    let dataPayment;
    if (!hasPayment) {
      const addPaymentPayload = { actions: [{ method: "addPayment" }], get: ["Payments"], objectName: "myOrder" };
      const rPayment = await sendCall(ORDER_PATH, addPaymentPayload);
      await handleSetCookies(rPayment);
      const rawPayment = await rPayment.text();
      try { dataPayment = JSON.parse(rawPayment); } catch { dataPayment = rawPayment; }
      if (!rPayment.ok) {
        printDebugMessage(`Checkout failed at addPayment: ${rPayment.status}`);
        return res.status(rPayment.status).json({ error: "Checkout failed (addPayment)", details: dataPayment });
      }
      paymentsObj = dataPayment?.data?.Payments || {};
    } else {
      dataPayment = dataCheck;
    }

    // Extract paymentID
    let paymentID = null;
    for (const [k, v] of Object.entries(paymentsObj)) {
      if (k !== "state" && v?.payment_id?.standard) { paymentID = v.payment_id.standard; break; }
    }
    if (!paymentID) {
      return res.status(500).json({ error: "No paymentID found after addPayment", details: paymentsObj });
    }

    // Step 3: set delivery & payment
    const setPayload = {
      set: {
        "Order::deliverymethod_id": deliveryMethod,
        [`Payments::${paymentID}::active_payment`]: paymentMethod,
        [`Payments::${paymentID}::swipe_indicator`]: "Internet",
        [`Payments::${paymentID}::cardholder_name`]: "Oliver Brito"
      },
      get: ["Order::order_number", "Payments"],
      objectName: "myOrder"
    };
    const rSet = await sendCall(ORDER_PATH, setPayload);
    await handleSetCookies(rSet);
    const rawSet = await rSet.text();
    let dataSet; try { dataSet = JSON.parse(rawSet); } catch { dataSet = rawSet; }
    if (!rSet.ok) {
      printDebugMessage(`Checkout failed at set delivery/payment: ${rSet.status}`);
      return res.status(rSet.status).json({ error: "Checkout failed (set delivery/payment)", details: dataSet });
    }

    // Step 4: getPaymentClientToken
    const tokenPayload = {
      actions: [{ method: "getPaymentClientToken", params: { payment_id: paymentID, pa_response_URL: "https://localhost:3444/checkout.html" } }],
      get: ["Order::order_number", "Payments"],
      objectName: "myOrder"
    };
    const rToken = await sendCall(ORDER_PATH, tokenPayload);
    await handleSetCookies(rToken);
    const rawToken = await rToken.text();
    let dataToken; try { dataToken = JSON.parse(rawToken); } catch { dataToken = rawToken; }

    // Step 5: get Payments::paymentID details
    const paymentDetailsPayload = { get: [`Payments::${paymentID}`], objectName: "myOrder" };
    const rDetails = await sendCall(ORDER_PATH, paymentDetailsPayload);
    await handleSetCookies(rDetails);
    const rawDetails = await rDetails.text();
    let dataDetails; try { dataDetails = JSON.parse(rawDetails); } catch { dataDetails = rawDetails; }
    printDebugMessage("Checkout completed successfully");
    res.json({ payment_details: dataDetails.data?.[`Payments::${paymentID}`], paymentID });
  } catch (err) {
    printDebugMessage(`Error in /checkout: ${err.message}`);
    res.status(500).json({ error: String(err?.message || err) });
  }
});


// This is for Adyen Ecommerce (Adyen Drop-in rendering) only

// First we need to get the payment configuration for the given payment method
// This will return the api_key for Adyen
router.post("/getPaymentClientConfig", async (req, res) => handlePaymentConfig(req, res));

async function handlePaymentConfig(req, res) {
  try {
    printDebugMessage("Starting /getPaymentClientConfig route");
    const { paymentMethodId } = req.body || {};
    if (!paymentMethodId) {
      printDebugMessage("No paymentMethodId provided, using fallback config");
      return res.json({ environment: 'test', clientKey: 'test_7REK4YQWRZB2DPRS7RNTFTGX2MPKY4SQ', countryCode: 'US', currency: 'USD' });
    }
    try { validateCall(req, [], ["PAYMENTMETHOD_PATH"], "getPaymentClientConfig"); } catch (e) {
      // If not authenticated, still return fallback
      printDebugMessage("No active session, using fallback config");
      return res.json({ environment: 'test', clientKey: 'test_7REK4YQWRZB2DPRS7RNTFTGX2MPKY4SQ', countryCode: 'US', currency: 'USD' });
    }
    const payload = {
      actions: [{ method: "getPaymentClientConfig", params: { payment_method_id: paymentMethodId }, acceptWarnings: [4294] }],
      objectName: "myPaymentMethod"
    };
    const response = await sendCall(PAYMENTMETHOD_PATH, payload);
    await handleSetCookies(response);
    const raw = await response.text();
    let data; try { data = JSON.parse(raw); } catch { data = raw; }
    if (!response.ok) {
      printDebugMessage(`Payment client config fetch failed: ${response.status}`);
      return res.json({ environment: 'test', clientKey: 'test_7REK4YQWRZB2DPRS7RNTFTGX2MPKY4SQ', countryCode: 'US', currency: 'USD', apiError: data });
    }
    try {
      const returnData = data?.return?.[0];
      if (returnData?.method === 'getPaymentClientConfig' && returnData?.values?.[0]?.name === 'result') {
        const configJson = returnData.values[0].value;
        const parsedConfig = JSON.parse(configJson);
        const adyenConfig = parsedConfig?.config;
        if (adyenConfig) {
          const clientConfig = {
            environment: adyenConfig.adyen_env || 'test',
            clientKey: adyenConfig.adyen_client_key || 'test_7REK4YQWRZB2DPRS7RNTFTGX2MPKY4SQ',
            countryCode: 'US',
            currency: 'USD',
            showPayButton: adyenConfig.adyen_showpaybutton || false,
            hostedFieldUps: adyenConfig.hosted_field_ups || false,
            hostedPageUps: adyenConfig.hosted_page_ups || false,
            phoneServiceUps: adyenConfig.phone_service_ups || false,
            adyenGatewayType: adyenConfig.adyen_gateway_type || false,
            deviceFingerprint: adyenConfig.device_fingerprint || null,
            rawConfig: adyenConfig
          };
          printDebugMessage("Payment client config fetched successfully");
          return res.json(clientConfig);
        }
      }
      printDebugMessage("Unexpected API response structure, using fallback config");
    } catch (parseErr) {
      printDebugMessage("Error parsing AudienceView config response");
    }
    return res.json({ environment: 'test', clientKey: 'test_7REK4YQWRZB2DPRS7RNTFTGX2MPKY4SQ', countryCode: 'US', currency: 'USD', apiResponse: data, fallback: true });
  } catch (err) {
    printDebugMessage(`Error in handlePaymentConfig: ${err.message}`);
    return res.json({ environment: 'test', clientKey: 'test_7REK4YQWRZB2DPRS7RNTFTGX2MPKY4SQ', countryCode: 'US', currency: 'USD', error: String(err?.message || err) });
  }
}


// Next, we need to get the payment gateway configuration for the given payment record
// this will provide the payment methods available, their given names and configs

router.post("/getPaymentResponse", async (req, res) => {
  try {
    validateCall(req, ["paymentID"], ["ORDER_PATH"], "getPaymentResponse");
    const { paymentID } = req.body || {};
    const payload = { get: [`Payments::${paymentID}::paymentmethod_gateway_config`], objectName: "myOrder" };
    const response = await sendCall(ORDER_PATH, payload);
    await handleSetCookies(response);
    const raw = await response.text();
    let data; try { data = JSON.parse(raw); } catch { return res.status(500).json({ error: "Invalid response from payment API", details: raw }); }
    if (!response.ok) {
      printDebugMessage(`Payment response fetch failed: ${response.status}`);
      return res.status(response.status).json({ error: "Failed to fetch payment gateway config", details: data });
    }
    const gatewayConfig = data?.data?.[`Payments::${paymentID}::paymentmethod_gateway_config`];
    if (!gatewayConfig) {
      printDebugMessage("No payment gateway config found in response");
      return res.status(404).json({ error: "Payment gateway config not found", paymentID, rawResponse: data });
    }
    try {
      const paymentMethodsJson = gatewayConfig.standard || gatewayConfig.display || gatewayConfig.input;
      if (paymentMethodsJson) {
        const paymentMethodsConfig = JSON.parse(paymentMethodsJson);
        printDebugMessage("Payment response fetched successfully");
        return res.json({ success: true, paymentID, paymentMethodsResponse: paymentMethodsConfig, gatewayConfig, rawResponse: data });
      }
      printDebugMessage("No payment methods JSON found in gateway config");
      return res.json({ success: true, paymentID, gatewayConfig, rawResponse: data, warning: "No payment methods configuration found" });
    } catch (parseError) {
      printDebugMessage("Error parsing payment methods JSON");
      return res.json({ success: true, paymentID, gatewayConfig, rawResponse: data, parseError: parseError.message });
    }
  } catch (err) {
    printDebugMessage(`Error in /getPaymentResponse: ${err.message}`);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// POST /processAdyenPayment -> Process Adyen payment data via AudienceView
// it will set the external_payment_data as provided, then call insert to complete the transaction
router.post("/processAdyenPayment", async (req, res) => {
  try {
    validateCall(req, ["externalData", "paymentID"], ["ORDER_PATH"], "processAdyenPayment");
    const { externalData, paymentID } = req.body || {};
    // Set external payment data
    const setPayload = { set: { [`Payments::${paymentID}::external_payment_data`]: externalData }, objectName: "myOrder", get: ["Payments"] };
    const setResp = await sendCall(ORDER_PATH, setPayload);
    await handleSetCookies(setResp);
    const rawSet = await setResp.text();
    let dataSet; try { dataSet = JSON.parse(rawSet); } catch { return res.status(500).json({ error: "Invalid response from payment API", details: rawSet }); }
    if (!setResp.ok) {
      printDebugMessage(`Adyen payment processing failed (set ext data): ${setResp.status}`);
      return res.status(setResp.status).json({ error: "Failed to process Adyen payment", details: dataSet });
    }
    const payments = dataSet?.data?.Payments || {};
    const paymentRecord = payments[paymentID];
    const externalPaymentDataSet = paymentRecord?.external_payment_data?.standard;
    if (externalPaymentDataSet !== externalData) {
      printDebugMessage("Adyen payment data verification failed");
      return res.json({ success: false, paymentID, externalDataSet: false, expectedData: externalData, actualData: externalPaymentDataSet, payments, message: "Adyen payment data verification failed", rawResponse: dataSet });
    }
    // Complete transaction
    const txPayload = { actions: [{ method: "insert", params: { notification: "correspondence" }, acceptWarnings: [5008, 4224, 5388] }], get: ["Order::order_number", "Payments"], objectName: "myOrder" };
    const txResp = await sendCall(ORDER_PATH, txPayload);
    await handleSetCookies(txResp);
    const rawTx = await txResp.text();
    let txData; try { txData = JSON.parse(rawTx); } catch { return res.status(500).json({ success: false, error: "Invalid response from transaction completion", details: rawTx, externalDataSet: true, paymentID }); }
    const is3dsRequired = (d) => { try { return JSON.stringify(d || '').includes('4294'); } catch { return false; } };
    if (!txResp.ok) {
      if (is3dsRequired(txData)) {
        printDebugMessage('Transaction completion indicates 3DS required (4294)');
        return await handleThreeDS(req, res, { paymentID, transactionData: txData });
      }
      printDebugMessage(`Transaction completion failed: ${txResp.status}`);
      return res.status(txResp.status).json({ success: false, error: "Failed to complete transaction", details: txData, externalDataSet: true, paymentID });
    }
    const orderNumber = txData?.data?.["Order::order_number"]?.standard;
    const finalPayments = txData?.data?.Payments || {};
    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    printDebugMessage("Adyen payment processed successfully");
    res.json({
      success: true,
      paymentID,
      externalDataSet: true,
      transactionCompleted: true,
      orderId: orderNumber,
      transactionId,
      redirectUrl: `/viewOrder.html?orderId=${orderNumber || transactionId}&transactionId=${transactionId}`,
      transactionDetails: {
        success: true,
        transactionId,
        orderId: orderNumber || transactionId,
        timestamp: new Date().toISOString(),
        paymentMethod: "Adyen",
        status: "completed",
        audienceViewResponse: txData
      },
      externalDataVerification: { expectedData: externalData, actualData: externalPaymentDataSet },
      payments: finalPayments,
      message: "Adyen payment processed and transaction completed successfully",
      rawTransactionResponse: txData
    });
  } catch (err) {
    printDebugMessage(`Error in /processAdyenPayment: ${err.message}`);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// POST /getPaymentMethodType -> Get payment method type for a specific payment ID
router.post("/getPaymentMethodType", async (req, res) => {
  try {
    validateCall(req, ["paymentID"], ["ORDER_PATH"], "getPaymentMethodType");
    const { paymentID } = req.body || {};
    const payload = { get: [`Payments::${paymentID}::paymentmethod_type`], objectName: "myOrder" };
    const response = await sendCall(ORDER_PATH, payload);
    await handleSetCookies(response);
    const raw = await response.text();
    let data; try { data = JSON.parse(raw); } catch { return res.status(500).json({ error: "Invalid response from payment API", details: raw }); }
    if (!response.ok) {
      printDebugMessage(`Payment method type fetch failed: ${response.status}`);
      return res.status(response.status).json({ error: "Failed to fetch payment method type", details: data });
    }
    const paymentMethodType = data?.data?.[`Payments::${paymentID}::paymentmethod_type`];
    if (!paymentMethodType) {
      printDebugMessage("No payment method type found in response");
      return res.status(404).json({ error: "Payment method type not found", paymentID, rawResponse: data });
    }
    printDebugMessage("Payment method type fetched successfully");
    res.json({ success: true, paymentID, paymentMethodType, rawResponse: data });
  } catch (err) {
    printDebugMessage(`Error in /getPaymentMethodType: ${err.message}`);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

export default router;

// Template handler for 3DS flow. Currently a no-op placeholder; extend as needed.
async function handleThreeDS(req, res, { paymentID } = {}) {
  printDebugMessage(`handleThreeDS invoked for paymentID: ${paymentID}`);
  try {
    const payload = { get: [`Payments::${paymentID}::pa_request_information`], objectName: 'myOrder' };
    const r = await sendCall(ORDER_PATH, payload);
    await handleSetCookies(r);
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    const paObj = data?.data?.[`Payments::${paymentID}::pa_request_information`];
    let paJsonStr = paObj?.standard || paObj?.input || paObj?.display || null;
    let paInfo = null;
    if (paJsonStr) {
      try { paInfo = JSON.parse(paJsonStr); } catch { try { paInfo = JSON.parse(JSON.parse(paJsonStr)); } catch { paInfo = paJsonStr; } }
    }
    return res.status(402).json({ success: false, error: '3ds required', code: 4294, paymentID, paRequestInfo: paInfo, rawResponse: data });
  } catch (err) {
    printDebugMessage(`Error in handleThreeDS: ${err.message}`);
    return res.status(500).json({ success: false, error: 'handleThreeDS error', details: String(err?.message || err) });
  }
}