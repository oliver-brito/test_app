// routes/adyen.js - Adyen-specific payment endpoints extracted from payments.js
import express from "express";
import { ENDPOINTS } from "../../public/endpoints.js";
import { printDebugMessage } from "../utils/debug.js";
import { validateCall, sendCall, handleSetCookies } from "../utils/common.js";

const router = express.Router();
const { ORDER: ORDER_PATH, PAYMENT_METHOD: PAYMENTMETHOD_PATH } = ENDPOINTS;

// POST /getPaymentClientConfig -> Retrieve Adyen client configuration
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

// POST /getPaymentResponse -> Get gateway configuration for a payment record
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
router.post("/processAdyenPayment", async (req, res) => {
  try {
    validateCall(req, ["externalData", "paymentID"], ["ORDER_PATH"], "processAdyenPayment");
    const { externalData, paymentID } = req.body || {};
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

// Internal 3DS handler (still placeholder)
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
