// server/routes/adyen.js — Adyen-specific payment endpoints. Each route is
// a thin adapter; the JSON-walking and config-parsing lives in
// server/services/adyen/.

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
import { ADYEN_FALLBACK_CONFIG } from "../services/adyen/constants.js";
import { parseAdyenClientConfig } from "../services/adyen/parseClientConfig.js";
import { parseAdyenGatewayConfig } from "../services/adyen/parseGatewayConfig.js";

const router = express.Router();
const { ORDER: ORDER_PATH, PAYMENT_METHOD: PAYMENTMETHOD_PATH } = ENDPOINTS;

const newTransactionId = () =>
  `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

/**
 * POST /getPaymentClientConfig — returns the Adyen Drop-in client config.
 * Falls back to a static config when unauthenticated or upstream errors,
 * so the UI can render the payment widget even before login.
 */
router.post("/getPaymentClientConfig", express.json(), async (req, res) => {
  const { paymentMethodId } = req.body || {};

  if (!paymentMethodId || !hasActiveSession()) {
    printDebugMessage("Falling back to static Adyen client config");
    return res.json(ADYEN_FALLBACK_CONFIG);
  }

  const { response, data } = await callAv(PAYMENTMETHOD_PATH, {
    actions: [
      {
        method: GET_PAYMENT_CLIENT_CONFIG,
        params: { payment_method_id: paymentMethodId },
        acceptWarnings: ACCEPTED_WARNINGS.PAYMENT_CLIENT_CONFIG,
      },
    ],
    objectName: MY_PAYMENT_METHOD,
  });

  if (!response.ok) {
    return res.json({ ...ADYEN_FALLBACK_CONFIG, apiError: data });
  }

  const parsed = parseAdyenClientConfig(data);
  if (parsed) return res.json(parsed);

  printDebugMessage("Unexpected client-config response — using fallback");
  return res.json({ ...ADYEN_FALLBACK_CONFIG, apiResponse: data, fallback: true });
});

/** POST /getPaymentResponse — gateway config (= Adyen paymentMethods) for a payment. */
router.post("/getPaymentResponse", express.json(), validate(PaymentIdBody), async (req, res) => {
  const { paymentId } = req.body;
  const gatewayConfigField = paymentField(paymentId, PAYMENT_FIELDS.PAYMENTMETHOD_GATEWAY_CONFIG);

  const result = await callAvManaged(
    ORDER_PATH,
    { get: [gatewayConfigField], objectName: MY_ORDER },
    "Failed to fetch payment gateway config"
  );

  const gatewayConfig = unwrap(result.data, gatewayConfigField);
  if (!gatewayConfig) {
    return res.status(404).json({
      error: "Payment gateway config not found",
      paymentId,
      rawResponse: result.data,
    });
  }

  const parsed = parseAdyenGatewayConfig(gatewayConfig);
  return res.json({
    success: true,
    paymentId,
    gatewayConfig,
    rawResponse: result.data,
    ...parsed,
  });
});

/** POST /processAdyenPayment — pushes Adyen's state.data onto the Payment, then completes the order. */
router.post(
  "/processAdyenPayment",
  express.json(),
  validate(ProcessAdyenPaymentBody),
  async (req, res) => {
    const { externalData, paymentId, resetPaymentAttempt } = req.body;

    await callAvManaged(
      ORDER_PATH,
      {
        set: { [paymentField(paymentId, PAYMENT_FIELDS.EXTERNAL_PAYMENT_DATA)]: externalData },
        objectName: MY_ORDER,
        get: [PAYMENTS],
      },
      "Failed to process Adyen payment"
    );

    const { response: txResp, data: txData } = await insertOrder({
      resetPaymentAttempt: !!resetPaymentAttempt,
    });

    if (!txResp.ok) {
      const kind = classifyException(txData);
      if (kind === "threeDS") return handleThreeDS(req, res, { paymentId, transactionData: txData });
      if (kind === "cancelled") {
        return res.status(txResp.status).json({
          success: false,
          cancelled: true,
          error: txData?.exception?.message || "Payment was cancelled",
          paymentId,
        });
      }
      if (txData?.exception?.message?.toLowerCase().includes("insertunpaid")) {
        return handleThreeDS(req, res, { paymentId });
      }
      return res.status(txResp.status).json({
        success: false,
        error: "Failed to complete transaction",
        details: txData,
        paymentId,
      });
    }

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

/** POST /getPaymentMethodType — surfaces Payments::<id>::paymentmethod_type to the UI. */
router.post(
  "/getPaymentMethodType",
  express.json(),
  validate(PaymentIdBody),
  async (req, res) => {
    const { paymentId } = req.body;
    const typeField = paymentField(paymentId, PAYMENT_FIELDS.PAYMENTMETHOD_TYPE);

    const result = await callAvManaged(
      ORDER_PATH,
      { get: [typeField], objectName: MY_ORDER },
      "Failed to fetch payment method type"
    );

    const paymentMethodType = unwrap(result.data, typeField);
    if (!paymentMethodType) {
      return res.status(404).json({
        error: "Payment method type not found",
        paymentId,
        rawResponse: result.data,
      });
    }

    res.json({ success: true, paymentId, paymentMethodType, rawResponse: result.data });
  }
);

export default router;
