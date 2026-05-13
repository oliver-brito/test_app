// server/routes/adyen.js — Adyen-specific payment endpoints.
import express from "express";
import { ENDPOINTS } from "../../public/js/endpoints.js";
import { printDebugMessage } from "../utils/debug.js";
import { callAv, callAvManaged, hasActiveSession } from "../services/avClient.js";
import { classifyException } from "../services/apiErrors.js";
import { unwrap } from "../services/avResponse.js";
import { ACCEPTED_WARNINGS } from "../constants.js";
import { insertOrder, redirectToViewOrder } from "../services/order.js";
import { handleThreeDS } from "../services/threeDSChallenge.js";
import { validate } from "../middleware/validate.js";
import { ProcessAdyenPaymentBody, PaymentIdBody } from "../schemas/payments.js";
import { MY_ORDER, MY_PAYMENT_METHOD } from "../av/objectNames.js";
import { GET_PAYMENT_CLIENT_CONFIG } from "../av/methods.js";
import { PAYMENTS, ORDER_NUMBER, paymentField, PAYMENT_FIELDS } from "../av/fields.js";

const router = express.Router();
const { ORDER: ORDER_PATH, PAYMENT_METHOD: PAYMENTMETHOD_PATH } = ENDPOINTS;

const ADYEN_FALLBACK_CONFIG = {
  environment: "test",
  clientKey: "test_7REK4YQWRZB2DPRS7RNTFTGX2MPKY4SQ",
  countryCode: "US",
  currency: "USD",
};

const newTransactionId = () =>
  `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

// POST /getPaymentClientConfig -> Retrieve Adyen client configuration.
// Falls back to a static config when unauthenticated or upstream errors,
// so the UI can render the payment widget even before login.
router.post("/getPaymentClientConfig", express.json(), async (req, res) => {
  printDebugMessage("Starting /getPaymentClientConfig route");
  const { paymentMethodId } = req.body || {};

  if (!paymentMethodId) {
    printDebugMessage("No paymentMethodId provided, using fallback config");
    return res.json(ADYEN_FALLBACK_CONFIG);
  }
  if (!hasActiveSession()) {
    printDebugMessage("No active session, using fallback config");
    return res.json(ADYEN_FALLBACK_CONFIG);
  }

  const payload = {
    actions: [
      {
        method: GET_PAYMENT_CLIENT_CONFIG,
        params: { payment_method_id: paymentMethodId },
        acceptWarnings: ACCEPTED_WARNINGS.PAYMENT_CLIENT_CONFIG,
      },
    ],
    objectName: MY_PAYMENT_METHOD,
  };

  const { response, data } = await callAv(PAYMENTMETHOD_PATH, payload);

  if (!response.ok) {
    printDebugMessage(`Payment client config fetch failed: ${response.status}`);
    return res.json({ ...ADYEN_FALLBACK_CONFIG, apiError: data });
  }

  try {
    const returnData = data?.return?.[0];
    if (
      returnData?.method === GET_PAYMENT_CLIENT_CONFIG &&
      returnData?.values?.[0]?.name === "result"
    ) {
      const adyenConfig = JSON.parse(returnData.values[0].value)?.config;
      if (adyenConfig) {
        printDebugMessage("Payment client config fetched successfully");
        return res.json({
          environment: adyenConfig.adyen_env || ADYEN_FALLBACK_CONFIG.environment,
          clientKey: adyenConfig.adyen_client_key || ADYEN_FALLBACK_CONFIG.clientKey,
          countryCode: "US",
          currency: "USD",
          showPayButton: adyenConfig.adyen_showpaybutton || false,
          hostedFieldUps: adyenConfig.hosted_field_ups || false,
          hostedPageUps: adyenConfig.hosted_page_ups || false,
          phoneServiceUps: adyenConfig.phone_service_ups || false,
          adyenGatewayType: adyenConfig.adyen_gateway_type || false,
          deviceFingerprint: adyenConfig.device_fingerprint || null,
          rawConfig: adyenConfig,
        });
      }
    }
    printDebugMessage("Unexpected API response structure, using fallback config");
  } catch {
    printDebugMessage("Error parsing AudienceView config response");
  }

  return res.json({ ...ADYEN_FALLBACK_CONFIG, apiResponse: data, fallback: true });
});

// POST /getPaymentResponse -> Get gateway configuration for a payment record
router.post("/getPaymentResponse", express.json(), validate(PaymentIdBody), async (req, res) => {
  const { paymentId } = req.body;
  const gatewayConfigField = paymentField(paymentId, PAYMENT_FIELDS.PAYMENTMETHOD_GATEWAY_CONFIG);

  const result = await callAvManaged(
    res,
    ORDER_PATH,
    { get: [gatewayConfigField], objectName: MY_ORDER },
    "Failed to fetch payment gateway config"
  );
  if (!result) return;

  const gatewayConfig = unwrap(result.data, gatewayConfigField);
  if (!gatewayConfig) {
    printDebugMessage("No payment gateway config found in response");
    return res.status(404).json({
      error: "Payment gateway config not found",
      paymentId,
      rawResponse: result.data,
    });
  }

  const paymentMethodsJson = gatewayConfig.standard || gatewayConfig.display || gatewayConfig.input;
  if (!paymentMethodsJson) {
    printDebugMessage("No payment methods JSON found in gateway config");
    return res.json({
      success: true,
      paymentId,
      gatewayConfig,
      rawResponse: result.data,
      warning: "No payment methods configuration found",
    });
  }

  try {
    const paymentMethodsConfig = JSON.parse(paymentMethodsJson);
    printDebugMessage("Payment response fetched successfully");
    return res.json({
      success: true,
      paymentId,
      paymentMethodsResponse: paymentMethodsConfig,
      gatewayConfig,
      rawResponse: result.data,
    });
  } catch (parseError) {
    printDebugMessage("Error parsing payment methods JSON");
    return res.json({
      success: true,
      paymentId,
      gatewayConfig,
      rawResponse: result.data,
      parseError: parseError.message,
    });
  }
});

// POST /processAdyenPayment -> Process Adyen payment data via AudienceView
router.post(
  "/processAdyenPayment",
  express.json(),
  validate(ProcessAdyenPaymentBody),
  async (req, res) => {
    const { externalData, paymentId, resetPaymentAttempt } = req.body;

    // 1. Push the Adyen response payload onto the Payment record.
    const setResult = await callAvManaged(
      res,
      ORDER_PATH,
      {
        set: { [paymentField(paymentId, PAYMENT_FIELDS.EXTERNAL_PAYMENT_DATA)]: externalData },
        objectName: MY_ORDER,
        get: [PAYMENTS],
      },
      "Failed to process Adyen payment"
    );
    if (!setResult) return;

    // 2. Re-insert the order so av-avon completes the charge.
    const { response: txResp, data: txData } = await insertOrder({
      resetPaymentAttempt: !!resetPaymentAttempt,
    });

    if (!txResp.ok) {
      const exceptionKind = classifyException(txData);
      if (exceptionKind === "threeDS") {
        printDebugMessage("Transaction completion indicates 3DS required");
        return handleThreeDS(req, res, { paymentId, transactionData: txData });
      }
      if (exceptionKind === "cancelled") {
        printDebugMessage("Payment cancelled by user");
        return res.status(txResp.status).json({
          success: false,
          cancelled: true,
          error: txData?.exception?.message || "Payment was cancelled",
          paymentId,
        });
      }
      if (txData?.exception?.message?.toLowerCase().includes("insertunpaid")) {
        printDebugMessage("Payment requires redirect completion (insertUnpaid)");
        return handleThreeDS(req, res, { paymentId });
      }
      printDebugMessage(`Transaction completion failed: ${txResp.status}`);
      return res.status(txResp.status).json({
        success: false,
        error: "Failed to complete transaction",
        details: txData,
        paymentId,
      });
    }

    printDebugMessage("Adyen payment processed and transaction completed successfully");
    return redirectToViewOrder(
      {
        orderNumber: unwrap(txData, ORDER_NUMBER)?.standard,
        transactionId: newTransactionId(),
        actionsJson: txData,
        respJson: txData,
        paymentMethod: "Adyen",
      },
      res
    );
  }
);

// POST /getPaymentMethodType -> Get payment method type for a specific payment ID
router.post(
  "/getPaymentMethodType",
  express.json(),
  validate(PaymentIdBody),
  async (req, res) => {
    const { paymentId } = req.body;
    const typeField = paymentField(paymentId, PAYMENT_FIELDS.PAYMENTMETHOD_TYPE);

    const result = await callAvManaged(
      res,
      ORDER_PATH,
      { get: [typeField], objectName: MY_ORDER },
      "Failed to fetch payment method type"
    );
    if (!result) return;

    const paymentMethodType = unwrap(result.data, typeField);
    if (!paymentMethodType) {
      printDebugMessage("No payment method type found in response");
      return res.status(404).json({
        error: "Payment method type not found",
        paymentId,
        rawResponse: result.data,
      });
    }

    printDebugMessage("Payment method type fetched successfully");
    res.json({ success: true, paymentId, paymentMethodType, rawResponse: result.data });
  }
);

export default router;
