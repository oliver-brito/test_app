// routes/adyen.js - Adyen-specific payment endpoints extracted from payments.js
import express from "express";
import { ENDPOINTS } from "../../public/js/endpoints.js";
import { printDebugMessage } from "../utils/debug.js";
import { validateCall, makeApiCall, makeApiCallWithErrorHandling, parseResponse, handleSetCookies, is3dsRequired } from "../utils/common.js";
import { handleThreeDS, insertOrder, redirectToViewOrder } from "./common.js";
import { wrapRoute, wrapRouteWithValidation } from "../utils/routeWrapper.js";

const router = express.Router();
const { ORDER: ORDER_PATH, PAYMENT_METHOD: PAYMENTMETHOD_PATH } = ENDPOINTS;

// POST /getPaymentClientConfig -> Retrieve Adyen client configuration
// Note: This endpoint has special fallback logic for unauthenticated requests
router.post("/getPaymentClientConfig", wrapRoute(async (req, res) => {
  printDebugMessage("Starting /getPaymentClientConfig route");
  const { paymentMethodId } = req.body || {};

  const fallbackConfig = { environment: 'test', clientKey: 'test_7REK4YQWRZB2DPRS7RNTFTGX2MPKY4SQ', countryCode: 'US', currency: 'USD' };

  if (!paymentMethodId) {
    printDebugMessage("No paymentMethodId provided, using fallback config");
    return res.json(fallbackConfig);
  }

  try {
    validateCall(req, [], ["PAYMENTMETHOD_PATH"], "getPaymentClientConfig");
  } catch (e) {
    // If not authenticated, still return fallback
    printDebugMessage("No active session, using fallback config");
    return res.json(fallbackConfig);
  }

  const payload = {
    actions: [{ method: "getPaymentClientConfig", params: { payment_method_id: paymentMethodId }, acceptWarnings: [4294] }],
    objectName: "myPaymentMethod"
  };

  // Use makeApiCall (not makeApiCallWithErrorHandling) so we can handle errors with fallback
  const { response, data } = await makeApiCall(PAYMENTMETHOD_PATH, payload);

  if (!response.ok) {
    printDebugMessage(`Payment client config fetch failed: ${response.status}`);
    return res.json({ ...fallbackConfig, apiError: data });
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

  return res.json({ ...fallbackConfig, apiResponse: data, fallback: true });
}));

// POST /getPaymentResponse -> Get gateway configuration for a payment record
router.post("/getPaymentResponse", wrapRouteWithValidation(
  async (req, res) => {
    const { paymentID } = req.body;
    const payload = { get: [`Payments::${paymentID}::paymentmethod_gateway_config`], objectName: "myOrder" };

    const result = await makeApiCallWithErrorHandling(
      res, ORDER_PATH, payload, "Failed to fetch payment gateway config"
    );
    if (!result) return; // Error already handled

    const gatewayConfig = result.data?.data?.[`Payments::${paymentID}::paymentmethod_gateway_config`];
    if (!gatewayConfig) {
      printDebugMessage("No payment gateway config found in response");
      return res.status(404).json({ error: "Payment gateway config not found", paymentID, rawResponse: result.data });
    }

    try {
      const paymentMethodsJson = gatewayConfig.standard || gatewayConfig.display || gatewayConfig.input;
      if (paymentMethodsJson) {
        const paymentMethodsConfig = JSON.parse(paymentMethodsJson);
        printDebugMessage("Payment response fetched successfully");
        return res.json({ success: true, paymentID, paymentMethodsResponse: paymentMethodsConfig, gatewayConfig, rawResponse: result.data });
      }
      printDebugMessage("No payment methods JSON found in gateway config");
      return res.json({ success: true, paymentID, gatewayConfig, rawResponse: result.data, warning: "No payment methods configuration found" });
    } catch (parseError) {
      printDebugMessage("Error parsing payment methods JSON");
      return res.json({ success: true, paymentID, gatewayConfig, rawResponse: result.data, parseError: parseError.message });
    }
  },
  { params: ["paymentID"], paths: ["ORDER_PATH"], name: "getPaymentResponse" }
));

// POST /processAdyenPayment -> Process Adyen payment data via AudienceView
router.post("/processAdyenPayment", wrapRouteWithValidation(
  async (req, res) => {
    const { externalData, paymentID } = req.body;

    // Step 1: Set external payment data
    const setPayload = { set: { [`Payments::${paymentID}::external_payment_data`]: externalData }, objectName: "myOrder", get: ["Payments"] };
    const setResult = await makeApiCallWithErrorHandling(
      res, ORDER_PATH, setPayload, "Failed to process Adyen payment"
    );
    if (!setResult) return; // Error already handled

    // Verify data was set correctly
    const payments = setResult.data?.data?.Payments || {};
    const paymentRecord = payments[paymentID];
    const externalPaymentDataSet = paymentRecord?.external_payment_data?.standard;
    if (externalPaymentDataSet !== externalData) {
      printDebugMessage("Adyen payment data verification failed");
      return res.json({
        success: false,
        paymentID,
        externalDataSet: false,
        expectedData: externalData,
        actualData: externalPaymentDataSet,
        payments,
        message: "Adyen payment data verification failed",
        rawResponse: setResult.data
      });
    }

    // Step 2: Complete transaction
    const txResp = await insertOrder();
    await handleSetCookies(txResp);
    const txData = await parseResponse(txResp);

    if (!txResp.ok) {
      if (is3dsRequired(txData)) {
        printDebugMessage('Transaction completion indicates 3DS required (4294)');
        return handleThreeDS(req, res, { paymentID, transactionData: txData });
      }
      printDebugMessage(`Transaction completion failed: ${txResp.status}`);
      return res.status(txResp.status).json({
        success: false,
        error: "Failed to complete transaction",
        details: txData,
        externalDataSet: true,
        paymentID
      });
    }

    const orderNumber = txData?.data?.["Order::order_number"]?.standard;
    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    printDebugMessage("Adyen payment processed and transaction completed successfully");
    return redirectToViewOrder({
      orderNumber,
      transactionId,
      actionsJson: txData,
      respJson: txData,
      paymentMethod: "Adyen"
    }, res);
  },
  { params: ["externalData", "paymentID"], paths: ["ORDER_PATH"], name: "processAdyenPayment" }
));

// POST /getPaymentMethodType -> Get payment method type for a specific payment ID
router.post("/getPaymentMethodType", wrapRouteWithValidation(
  async (req, res) => {
    const { paymentID } = req.body;
    const payload = { get: [`Payments::${paymentID}::paymentmethod_type`], objectName: "myOrder" };

    const result = await makeApiCallWithErrorHandling(
      res, ORDER_PATH, payload, "Failed to fetch payment method type"
    );
    if (!result) return; // Error already handled

    const paymentMethodType = result.data?.data?.[`Payments::${paymentID}::paymentmethod_type`];
    if (!paymentMethodType) {
      printDebugMessage("No payment method type found in response");
      return res.status(404).json({ error: "Payment method type not found", paymentID, rawResponse: result.data });
    }

    printDebugMessage("Payment method type fetched successfully");
    res.json({ success: true, paymentID, paymentMethodType, rawResponse: result.data });
  },
  { params: ["paymentID"], paths: ["ORDER_PATH"], name: "getPaymentMethodType" }
));

export default router;
