// routes/payments.js
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { authHeaders } from "../utils/authHeaders.js";
import { parseSetCookieHeader, mergeCookiePairs } from "../utils/cookieUtils.js";
import { getCookies, setCookies } from "../utils/sessionStore.js";
import { CURRENT_SESSION } from "../utils/sessionStore.js";
import { isDebugMode } from "../utils/debug.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const router = express.Router();

// --- Environment variables from .env
const {
  API_BASE,
  ORDER_PATH
} = process.env;

// POST /transaction -> Process payment transaction via AudienceView API
router.post("/transaction", express.json(), async (req, res) => {
  try {
    if (isDebugMode()) console.log("Starting /transaction route");
    
    if (!CURRENT_SESSION) return res.status(401).json({ error: "Not authenticated" });
    if (!ORDER_PATH) return res.status(500).json({ error: "ORDER_PATH not configured" });

    const { paymentData, orderData, paymentID } = req.body || {};

    const url = new URL(ORDER_PATH, API_BASE).toString();

    // Use paymentID from request if provided, else default to "hola"
    const usedPaymentID = paymentID || "hola";

    // Call AudienceView order insert API
    const payload = {
      actions: [
        {
          method: "insert",
          params: {
            notification: "correspondence"
          },
          acceptWarnings: [
            5008,
            4224,
            5388
          ]
        }
      ],
      get: ["Order::order_number", "Payments"],
      objectName: "myOrder"
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    // console.log('AudienceView response status:', response.status);

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = responseText;
    }

    if (!response.ok) {
      if (isDebugMode()) console.log("Transaction failed:", response.status);
      return res.status(response.status).json({
        success: false,
        error: "Transaction failed",
        details: responseData
      });
    }

    // Extract order information from response
    const orderNumber = responseData?.data?.["Order::order_number"]?.standard;
    const payments = responseData?.data?.Payments || {};
    
    // console.log('Transaction completed successfully');
    // console.log('Order number:', orderNumber);
    // console.log('Payments:', payments);

    // Generate mock transaction ID for display purposes
    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    if (isDebugMode()) console.log("Transaction completed successfully");
    // Redirect to success page with transaction details
    res.json({
      success: true,
      redirectUrl: `/viewOrder.html?orderId=${orderNumber || transactionId}&transactionId=${transactionId}`,
      transactionDetails: {
        success: true,
        transactionId: transactionId,
        orderId: orderNumber || transactionId,
        timestamp: new Date().toISOString(),
        paymentMethod: orderData?.paymentMethod || "Credit Card",
        status: "completed",
        audienceViewResponse: responseData
      }
    });

  } catch (err) {
    if (isDebugMode()) console.log("Error in /transaction:", err.message);
    res.status(500).json({ 
      success: false,
      error: String(err?.message || err) 
    });
  }
});


router.post("/checkout", express.json(), async (req, res) => {
  try {
    if (isDebugMode()) console.log("Starting /checkout route");
    
    if (!CURRENT_SESSION) return res.status(401).json({ error: "Not authenticated" });
    if (!ORDER_PATH) return res.status(500).json({ error: "ORDER_PATH not configured" });

    const { deliveryMethod, paymentMethod } = req.body || {};
    const url = new URL(ORDER_PATH, API_BASE).toString();


    // Step 1: addCustomer
    const payloadCustomer = {
      actions: [
        {
          method: "addCustomer",
          params: {
            "Customer::customer_number": "1"
            // "Customer::customer_id": "7508E7EB-32FA-4CD2-BA08-D3CE427CAD70"
          }
        }
      ],
      get: ["Order::order_number", "Payments"],
      objectName: "myOrder"
    };
    const rCustomer = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payloadCustomer)
    });
    const rawCustomer = await rCustomer.text();
    let dataCustomer; try { dataCustomer = JSON.parse(rawCustomer); } catch { dataCustomer = rawCustomer; }
    if (!rCustomer.ok) {
      if (isDebugMode()) console.log("Checkout failed at addCustomer:", rCustomer.status);
      return res.status(rCustomer.status).json({ error: "Checkout failed (addCustomer)", details: dataCustomer });
    }

    // Step 2: check Payments before addPayment
    const payloadCheckPayments = {
      get: ["Payments"],
      objectName: "myOrder"
    };
    const rCheckPayments = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payloadCheckPayments)
    });
    const rawCheckPayments = await rCheckPayments.text();
    let dataCheckPayments; try { dataCheckPayments = JSON.parse(rawCheckPayments); } catch { dataCheckPayments = rawCheckPayments; }
    let paymentsObj = dataCheckPayments?.data?.Payments || {};
    let hasPayment = false;
    for (const k in paymentsObj) {
      if (k === "state") continue;
      if (paymentsObj[k]?.payment_id?.standard) {
        hasPayment = true;
        break;
      }
    }

    let dataPayment;
    if (!hasPayment) {
      // Only add payment if none exists
      const payloadPayment = {
        actions: [
          {
            method: "addPayment"
          }
        ],
        get: ["Payments"],
        objectName: "myOrder"
      };
      const rPayment = await fetch(url, {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payloadPayment)
      });
      const rawPayment = await rPayment.text();
      try { dataPayment = JSON.parse(rawPayment); } catch { dataPayment = rawPayment; }
      if (!rPayment.ok) {
        if (isDebugMode()) console.log("Checkout failed at addPayment:", rPayment.status);
        return res.status(rPayment.status).json({ error: "Checkout failed (addPayment)", details: dataPayment });
      }
      paymentsObj = dataPayment?.data?.Payments || {};
    } else {
      // Use existing paymentsObj
      dataPayment = dataCheckPayments;
    }

    // Extract paymentID from Payments
    let paymentID = null;
    const payments = dataPayment?.data?.Payments || {};
    for (const [k, v] of Object.entries(payments)) {
      if (k === "state") continue;
      if (v?.payment_id?.standard) {
        paymentID = v.payment_id.standard;
        break;
      }
    }
    if (!paymentID) {
      return res.status(500).json({ error: "No paymentID found after addPayment", details: dataPayment });
    }

    // Step 2: set delivery and payment method
    const payload2 = {
      set: {
        "Order::deliverymethod_id": deliveryMethod,
        [`Payments::${paymentID}::active_payment`]: paymentMethod,
        [`Payments::${paymentID}::swipe_indicator`]: "Internet",
        [`Payments::${paymentID}::cardholder_name`]: "Oliver Brito"
      },
      get: ["Order::order_number", "Payments"],
      objectName: "myOrder"
    };
    const r2 = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload2)
    });
    const raw2 = await r2.text();
    let data2; try { data2 = JSON.parse(raw2); } catch { data2 = raw2; }
    if (!r2.ok) {
      if (isDebugMode()) console.log("Checkout failed at set delivery/payment:", r2.status);
      return res.status(r2.status).json({ error: "Checkout failed (set delivery/payment)", details: data2 });
    }

    // Step 3: getPaymentClientToken
    const payload3 = {
      actions: [
        {
          method: "getPaymentClientToken",
          params: { 
            payment_id: paymentID,
            pa_response_URL: "https://localhost:3443/checkout.html"
          }
        }
      ],
      get: ["Order::order_number", "Payments"],
      objectName: "myOrder"
    };
    const r3 = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload3)
    });
    const raw3 = await r3.text();
    let data3; try { data3 = JSON.parse(raw3); } catch { data3 = raw3; }
    const csp3 = r3.headers.get("content-security-policy");
    
    // Step 4: get Payments::payment_id
    const payload4 = {
      get: [ `Payments::${paymentID}` ],
      objectName: "myOrder"
    };
    const r4 = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload4)
    });
    const raw4 = await r4.text();
    let data4; try { data4 = JSON.parse(raw4); } catch { data4 = raw4; }
    // Return all steps for debugging
    if (isDebugMode()) console.log("Checkout completed successfully");
    res.json({ payment_details: data4.data?.[`Payments::${paymentID}`] });
  } catch (err) {
    if (isDebugMode()) console.log("Error in /checkout:", err.message);
    res.status(500).json({ error: String(err?.message || err) });
  }
});


// This is for Adyen Ecommerce (Adyen Drop-in rendering) only

// First we need to get the payment configuration for the given payment method
// This will return the api_key for Adyen
router.post("/getPaymentClientConfig", async (req, res) => {
  // Handle POST request with payment context
  return handlePaymentConfig(req, res);
});

async function handlePaymentConfig(req, res) {
  try {
    if (isDebugMode()) console.log("Starting /getPaymentClientConfig route");
    
    const { paymentMethodId, eventId, paymentID } = req.body || {};
    
    // Check if we have a payment method ID to work with
    if (!paymentMethodId) {
      if (isDebugMode()) console.log("No paymentMethodId provided, using fallback config");
      return res.json({
        environment: 'test',
        clientKey: 'test_7REK4YQWRZB2DPRS7RNTFTGX2MPKY4SQ',
        countryCode: 'US',
        currency: 'USD'
      });
    }

    // Make the call to AudienceView paymentMethod API
    if (!CURRENT_SESSION) {
      if (isDebugMode()) console.log("No active session, using fallback config");
      return res.json({
        environment: 'test',
        clientKey: 'test_7REK4YQWRZB2DPRS7RNTFTGX2MPKY4SQ',
        countryCode: 'US',
        currency: 'USD'
      });
    }

    const paymentMethodUrl = new URL('/app/WebAPI/v2/paymentMethod', API_BASE).toString();
    const payload = {
      actions: [
        {
          method: "getPaymentClientConfig",
          params: {
            payment_method_id: paymentMethodId
          },
          acceptWarnings: [4294]
        }
      ],
      objectName: "myPaymentMethod"
    };

    const response = await fetch(paymentMethodUrl, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = responseText;
    }

    if (!response.ok) {
      if (isDebugMode()) console.log("Payment client config fetch failed:", response.status);
      // Fall back to default config on API error
      return res.json({
        environment: 'test',
        clientKey: 'test_7REK4YQWRZB2DPRS7RNTFTGX2MPKY4SQ',
        countryCode: 'US',
        currency: 'USD',
        apiError: responseData
      });
    }

    // Extract the configuration from the AudienceView response structure
    try {
      const returnData = responseData?.return?.[0];
      if (returnData?.method === 'getPaymentClientConfig' && returnData?.values?.[0]?.name === 'result') {
        // Parse the JSON string in the result value
        const configJson = returnData.values[0].value;
        const parsedConfig = JSON.parse(configJson);
        const adyenConfig = parsedConfig?.config;
        
        if (adyenConfig) {
          // Extract Adyen configuration
          const clientConfig = {
            environment: adyenConfig.adyen_env || 'test',
            clientKey: adyenConfig.adyen_client_key || 'test_7REK4YQWRZB2DPRS7RNTFTGX2MPKY4SQ',
            countryCode: 'US', // Not provided in AV response, using default
            currency: 'USD',   // Not provided in AV response, using default
            showPayButton: adyenConfig.adyen_showpaybutton || false,
            hostedFieldUps: adyenConfig.hosted_field_ups || false,
            hostedPageUps: adyenConfig.hosted_page_ups || false,
            phoneServiceUps: adyenConfig.phone_service_ups || false,
            adyenGatewayType: adyenConfig.adyen_gateway_type || false,
            deviceFingerprint: adyenConfig.device_fingerprint || null,
            rawConfig: adyenConfig
          };
          
          if (isDebugMode()) console.log("Payment client config fetched successfully");
          return res.json(clientConfig);
        }
      }
      
      // If we can't parse the expected structure, log and fall back
      if (isDebugMode()) console.log("Unexpected API response structure, using fallback config");
      
    } catch (parseError) {
      if (isDebugMode()) console.log("Error parsing AudienceView config response");
    }
    
    // Fallback configuration
    res.json({
      environment: 'test',
      clientKey: 'test_7REK4YQWRZB2DPRS7RNTFTGX2MPKY4SQ',
      countryCode: 'US',
      currency: 'USD',
      apiResponse: responseData,
      fallback: true
    });
    
  } catch (err) {
    if (isDebugMode()) console.log("Error in handlePaymentConfig:", err.message);
    // Always fall back to working config on error
    res.json({
      environment: 'test',
      clientKey: 'test_7REK4YQWRZB2DPRS7RNTFTGX2MPKY4SQ',
      countryCode: 'US',
      currency: 'USD',
      error: String(err?.message || err)
    });
  }
}


// Next, we need to get the payment gateway configuration for the given payment record
// this will provide the payment methods available, their given names and configs

router.post("/getPaymentResponse", async (req, res) => {
  try {
    if (isDebugMode()) console.log("Starting /getPaymentResponse route");
    
    const { paymentID } = req.body || {};
    
    // Check authentication
    if (!CURRENT_SESSION) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    if (!ORDER_PATH) {
      return res.status(500).json({ error: "ORDER_PATH not configured" });
    }

    // Check if we have a payment ID
    if (!paymentID) {
      return res.status(400).json({ 
        error: "Missing paymentID",
        message: "paymentID is required to fetch payment gateway config"
      });
    }

    const url = new URL(ORDER_PATH, API_BASE).toString();
    const payload = {
      get: [
        `Payments::${paymentID}::paymentmethod_gateway_config`
      ],
      objectName: "myOrder"
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      return res.status(500).json({ 
        error: "Invalid response from payment API",
        details: responseText
      });
    }

    if (!response.ok) {
      if (isDebugMode()) console.log("Payment response fetch failed:", response.status);
      return res.status(response.status).json({
        error: "Failed to fetch payment gateway config",
        details: responseData
      });
    }

    // Extract the payment gateway configuration
    const gatewayConfig = responseData?.data?.[`Payments::${paymentID}::paymentmethod_gateway_config`];
    
    if (!gatewayConfig) {
      if (isDebugMode()) console.log("No payment gateway config found in response");
      return res.status(404).json({
        error: "Payment gateway config not found",
        paymentID: paymentID,
        rawResponse: responseData
      });
    }

    // Parse the payment methods from the JSON string in the standard field
    try {
      const paymentMethodsJson = gatewayConfig.standard || gatewayConfig.display || gatewayConfig.input;
      
      if (paymentMethodsJson) {
        const paymentMethodsConfig = JSON.parse(paymentMethodsJson);
        
        if (isDebugMode()) console.log("Payment response fetched successfully");
        res.json({
          success: true,
          paymentID: paymentID,
          paymentMethodsResponse: paymentMethodsConfig,
          gatewayConfig: gatewayConfig,
          rawResponse: responseData
        });
      } else {
        if (isDebugMode()) console.log("No payment methods JSON found in gateway config");
        res.json({
          success: true,
          paymentID: paymentID,
          gatewayConfig: gatewayConfig,
          rawResponse: responseData,
          warning: "No payment methods configuration found"
        });
      }
      
    } catch (parseError) {
      if (isDebugMode()) console.log("Error parsing payment methods JSON");
      
      res.json({
        success: true,
        paymentID: paymentID,
        gatewayConfig: gatewayConfig,
        rawResponse: responseData,
        parseError: parseError.message
      });
    }

  } catch (err) {
    if (isDebugMode()) console.log("Error in /getPaymentResponse:", err.message);
    res.status(500).json({ 
      error: String(err?.message || err) 
    });
  }
});

// POST /processAdyenPayment -> Process Adyen payment data via AudienceView
// it will set the external_payment_data as provided, then call insert to complete the transaction
router.post("/processAdyenPayment", async (req, res) => {
  try {
    if (isDebugMode()) console.log("Starting /processAdyenPayment route");
    
    if (!CURRENT_SESSION) return res.status(401).json({ error: "Not authenticated" });
    if (!ORDER_PATH) return res.status(500).json({ error: "ORDER_PATH not configured" });

    const { externalData, paymentID } = req.body || {};
    
    if (!externalData) {
      return res.status(400).json({ 
        error: "Missing externalData",
        message: "externalData is required for Adyen payment processing"
      });
    }
    
    if (!paymentID) {
      return res.status(400).json({ 
        error: "Missing paymentID",
        message: "paymentID is required to identify the payment record"
      });
    }

    const url = new URL(ORDER_PATH, API_BASE).toString();
    
    // Set the external payment data in AudienceView
    const payload = {
      set: {
        [`Payments::${paymentID}::external_payment_data`]: externalData
      },
      objectName: "myOrder",
      get: ["Payments"]
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    // Capture any cookies set by the endpoint
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      const pairs = parseSetCookieHeader(setCookie);
      setCookies(mergeCookiePairs(getCookies(), pairs));
    }

    const responseText = await response.text();

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      return res.status(500).json({
        error: "Invalid response from payment API",
        details: responseText
      });
    }

    if (!response.ok) {
      if (isDebugMode()) console.log("Adyen payment processing failed:", response.status);
      return res.status(response.status).json({
        error: "Failed to process Adyen payment",
        details: responseData
      });
    }

    // Extract payments information from response
    const payments = responseData?.data?.Payments || {};
    const paymentRecord = payments[paymentID];
    
    // Check if external_payment_data was successfully set
    const externalPaymentDataSet = paymentRecord?.external_payment_data?.standard;
    const externalDataMatches = externalPaymentDataSet === externalData;
    
    if (!externalDataMatches) {
      if (isDebugMode()) console.log("Adyen payment data verification failed");
      return res.json({
        success: false,
        paymentID: paymentID,
        externalDataSet: false,
        expectedData: externalData,
        actualData: externalPaymentDataSet,
        payments: payments,
        message: "Adyen payment data verification failed - external data not set correctly",
        rawResponse: responseData
      });
    }

    // Step 2: If external data was set successfully, call the insert endpoint to complete the payment
    const transactionPayload = {
      actions: [
        {
          method: "insert",
          params: {
            notification: "correspondence"
          },
          acceptWarnings: [
            5008,
            4224,
            5388
          ]
        }
      ],
      get: ["Order::order_number", "Payments"],
      objectName: "myOrder"
    };

    const transactionResponse = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(transactionPayload)
    });

    const transactionResponseText = await transactionResponse.text();

    let transactionData;
    try {
      transactionData = JSON.parse(transactionResponseText);
    } catch (e) {
      return res.status(500).json({
        success: false,
        error: "Invalid response from transaction completion",
        details: transactionResponseText,
        externalDataSet: true,
        paymentID: paymentID
      });
    }

    const is3dsRequired_transaction = (data) => {
      try { return JSON.stringify(data || '').indexOf('4294') !== -1; } catch (e) { return false; }
    };

    if (!transactionResponse.ok) {
      if (is3dsRequired_transaction(transactionData)) {
        if (isDebugMode()) console.log('Transaction completion indicates 3DS required (4294)');
        // delegate to handleThreeDS template
        return await handleThreeDS(req, res, { paymentID, transactionData });
      }

      if (isDebugMode()) console.log("Transaction completion failed:", transactionResponse.status);
      return res.status(transactionResponse.status).json({
        success: false,
        error: "Failed to complete transaction after setting external data",
        details: transactionData,
        externalDataSet: true,
        paymentID: paymentID
      });
    }

    // Extract order information from transaction response
    const orderNumber = transactionData?.data?.["Order::order_number"]?.standard;
    const finalPayments = transactionData?.data?.Payments || {};
    
    if (isDebugMode()) console.log("Adyen payment processed successfully");

    // Generate transaction ID for display purposes
    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    res.json({
      success: true,
      paymentID: paymentID,
      externalDataSet: true,
      transactionCompleted: true,
      orderId: orderNumber,
      transactionId: transactionId,
      redirectUrl: `/viewOrder.html?orderId=${orderNumber || transactionId}&transactionId=${transactionId}`,
      transactionDetails: {
        success: true,
        transactionId: transactionId,
        orderId: orderNumber || transactionId,
        timestamp: new Date().toISOString(),
        paymentMethod: "Adyen",
        status: "completed",
        audienceViewResponse: transactionData
      },
      externalDataVerification: {
        expectedData: externalData,
        actualData: externalPaymentDataSet
      },
      payments: finalPayments,
      message: "Adyen payment processed and transaction completed successfully",
      rawTransactionResponse: transactionData
    });

  } catch (err) {
    if (isDebugMode()) console.log("Error in /processAdyenPayment:", err.message);
    res.status(500).json({ 
      error: String(err?.message || err) 
    });
  }
});

// POST /getPaymentMethodType -> Get payment method type for a specific payment ID
router.post("/getPaymentMethodType", async (req, res) => {
  try {
    if (isDebugMode()) console.log("Starting /getPaymentMethodType route");
    
    if (!CURRENT_SESSION) return res.status(401).json({ error: "Not authenticated" });
    if (!ORDER_PATH) return res.status(500).json({ error: "ORDER_PATH not configured" });

    const { paymentID } = req.body || {};
    
    if (!paymentID) {
      return res.status(400).json({ 
        error: "Missing paymentID",
        message: "paymentID is required to fetch payment method type"
      });
    }

    const url = new URL(ORDER_PATH, API_BASE).toString();
    
    // Get the payment method type from AudienceView
    const payload = {
      get: [`Payments::${paymentID}::paymentmethod_type`],
      objectName: "myOrder"
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    // Capture any cookies set by the endpoint
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      const pairs = parseSetCookieHeader(setCookie);
      setCookies(mergeCookiePairs(getCookies(), pairs));
    }

    const responseText = await response.text();

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      return res.status(500).json({
        error: "Invalid response from payment API",
        details: responseText
      });
    }

    if (!response.ok) {
      if (isDebugMode()) console.log("Payment method type fetch failed:", response.status);
      return res.status(response.status).json({
        error: "Failed to fetch payment method type",
        details: responseData
      });
    }

    // Extract the payment method type from response
    const paymentMethodType = responseData?.data?.[`Payments::${paymentID}::paymentmethod_type`];
    
    if (!paymentMethodType) {
      if (isDebugMode()) console.log("No payment method type found in response");
      return res.status(404).json({
        error: "Payment method type not found",
        paymentID: paymentID,
        rawResponse: responseData
      });
    }

    if (isDebugMode()) console.log("Payment method type fetched successfully");
    res.json({
      success: true,
      paymentID: paymentID,
      paymentMethodType: paymentMethodType,
      rawResponse: responseData
    });

  } catch (err) {
    if (isDebugMode()) console.log("Error in /getPaymentMethodType:", err.message);
    res.status(500).json({ 
      error: String(err?.message || err) 
    });
  }
});

// endpoint /checkPaResponseInformation
router.post("/checkPaResponseInformation", async (req, res) => {
  try {
    if (isDebugMode()) console.log("Starting /checkPaResponseInformation route");

    if (!CURRENT_SESSION) return res.status(401).json({ error: "Not authenticated" });
    if (!ORDER_PATH) return res.status(500).json({ error: "ORDER_PATH not configured" });

    const { paymentID } = req.body || {};

    if (!paymentID) {
      return res.status(400).json({
        error: "Missing paymentID",
        message: "paymentID is required to check PA response information"
      });
    }

    // Fetch pa_response_information for this payment and parse it similar to pa_request_information
    const url = new URL(ORDER_PATH, API_BASE).toString();
    const payload = {
      get: [ `Payments::${paymentID}::pa_response_information` ],
      objectName: 'myOrder'
    };

    const r = await fetch(url, {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const text = await r.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }

    // Extract pa_response_information object (standard/input/display)
    const paObj = data?.data?.[`Payments::${paymentID}::pa_response_information`];
    let paJsonStr = paObj?.standard || paObj?.input || paObj?.display || null;
    let paInfo = null;
    if (paJsonStr) {
      try {
        paInfo = JSON.parse(paJsonStr);
      } catch (e) {
        // if it's a stringified JSON inside quotes, try a second parse
        try { paInfo = JSON.parse(JSON.parse(paJsonStr)); } catch { paInfo = paJsonStr; }
      }
    }

    // Return parsed pa_response_information
    if (!r.ok) {
      if (isDebugMode()) console.log("Failed to fetch pa_response_information:", r.status);
      return res.status(r.status).json({
        success: false,
        error: 'Failed to fetch pa_response_information',
        paymentID,
        rawResponse: data
      });
    }

    // If paInfo contains an action/paRequestInfo for the client, return it in a shape the client expects
    if (paInfo) {
      if (isDebugMode()) console.log('pa_response_information present, returning paRequestInfo action payload');
      // Common fields for Adyen-like handleAction: action object may vary; return paInfo directly if it looks like an action
      // Fallback: wrap in { paRequestInfo: paInfo }
      const looksLikeAction = paInfo && (paInfo.type || paInfo.action || paInfo.paymentData || paInfo.redirect); 
      const actionPayload = looksLikeAction ? paInfo : { paRequestInfo: paInfo };

      return res.json({
        success: false,
        error: '3ds required',
        code: 4294,
        paymentID,
        paRequestInfo: actionPayload,
        paResponseInfo: paInfo,
        rawResponse: data
      });
    }

    return res.json({
      success: true,
      paymentID,
      paResponseInfo: paInfo,
      rawResponse: data
    });

  } catch (err) {
    if (isDebugMode()) console.log("Error in /checkPaResponseInformation:", err.message);
    res.status(500).json({
      error: String(err?.message || err)
    });
  }
});

export default router;