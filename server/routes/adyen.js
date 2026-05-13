// server/routes/adyen.js — Adyen-specific payment endpoints. Each route
// is a thin handler; JSON-walking and config-parsing live in
// server/services/adyen/.

import express from "express";
import { ENDPOINTS } from "../../public/js/endpoints.js";
import { printDebugMessage } from "../utils/debug.js";
import { av, hasActiveSession } from "../services/av.js";
import { classifyException } from "../services/apiErrors.js";
import { unwrap } from "../services/avResponse.js";
import { ACCEPTED_WARNINGS } from "../constants.js";
import { insertOrder, redirectToViewOrder } from "../services/order.js";
import { handleThreeDS } from "../services/threeDSChallenge.js";
import { handler } from "../middleware/handler.js";
import { ApiError } from "../middleware/errorHandler.js";
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
 * Returns the Adyen Drop-in client config. Falls back to a static config
 * when unauthenticated or upstream errors — the UI can render the widget
 * even before login.
 */
const getPaymentClientConfig = handler({
  async run({ paymentMethodId }) {
    if (!paymentMethodId || !hasActiveSession()) {
      printDebugMessage("Falling back to static Adyen client config");
      return ADYEN_FALLBACK_CONFIG;
    }

    const { response, data } = await av
      .on(MY_PAYMENT_METHOD)
      .action(
        GET_PAYMENT_CLIENT_CONFIG,
        { payment_method_id: paymentMethodId },
        { acceptWarnings: ACCEPTED_WARNINGS.PAYMENT_CLIENT_CONFIG }
      )
      .post(PAYMENTMETHOD_PATH);

    if (!response.ok) return { ...ADYEN_FALLBACK_CONFIG, apiError: data };

    const parsed = parseAdyenClientConfig(data);
    if (parsed) return parsed;

    printDebugMessage("Unexpected client-config response — using fallback");
    return { ...ADYEN_FALLBACK_CONFIG, apiResponse: data, fallback: true };
  },
});

/** Gateway config (= Adyen paymentMethods) for a payment record. */
const getPaymentResponse = handler({
  body: PaymentIdBody,
  async run({ paymentId }) {
    const gatewayConfigField = paymentField(paymentId, PAYMENT_FIELDS.PAYMENTMETHOD_GATEWAY_CONFIG);

    const { data } = await av
      .on(MY_ORDER)
      .get(gatewayConfigField)
      .post(ORDER_PATH)
      .orFail("Failed to fetch payment gateway config");

    const gatewayConfig = unwrap(data, gatewayConfigField);
    if (!gatewayConfig) {
      throw new ApiError(404, "Payment gateway config not found", {
        details: { paymentId, rawResponse: data },
      });
    }

    const parsed = parseAdyenGatewayConfig(gatewayConfig);
    return { success: true, paymentId, gatewayConfig, rawResponse: data, ...parsed };
  },
});

/** Push Adyen's state.data onto the Payment, then complete the order. */
const processAdyenPayment = handler({
  body: ProcessAdyenPaymentBody,
  async run({ externalData, paymentId, resetPaymentAttempt }, { req, res }) {
    await av
      .on(MY_ORDER)
      .set({ [paymentField(paymentId, PAYMENT_FIELDS.EXTERNAL_PAYMENT_DATA)]: externalData })
      .get(PAYMENTS)
      .post(ORDER_PATH)
      .orFail("Failed to process Adyen payment");

    const { response: txResp, data: txData } = await insertOrder({
      resetPaymentAttempt: !!resetPaymentAttempt,
    });

    if (!txResp.ok) {
      const kind = classifyException(txData);
      if (kind === "threeDS") {
        await handleThreeDS(req, res, { paymentId, transactionData: txData });
        return; // response already sent
      }
      if (kind === "cancelled") {
        return {
          success: false,
          cancelled: true,
          error: txData?.exception?.message || "Payment was cancelled",
          paymentId,
        };
      }
      if (txData?.exception?.message?.toLowerCase().includes("insertunpaid")) {
        await handleThreeDS(req, res, { paymentId });
        return;
      }
      throw new ApiError(txResp.status, "Failed to complete transaction", {
        details: txData,
      });
    }

    redirectToViewOrder(
      {
        orderNumber: unwrap(txData, ORDER_NUMBER)?.standard,
        transactionId: newTransactionId(),
        actionsJson: txData,
        respJson: txData,
        paymentMethod: "Adyen",
      },
      res
    );
    return; // response already sent
  },
});

/** Surfaces Payments::<id>::paymentmethod_type to the UI. */
const getPaymentMethodType = handler({
  body: PaymentIdBody,
  async run({ paymentId }) {
    const typeField = paymentField(paymentId, PAYMENT_FIELDS.PAYMENTMETHOD_TYPE);

    const { data } = await av
      .on(MY_ORDER)
      .get(typeField)
      .post(ORDER_PATH)
      .orFail("Failed to fetch payment method type");

    const paymentMethodType = unwrap(data, typeField);
    if (!paymentMethodType) {
      throw new ApiError(404, "Payment method type not found", {
        details: { paymentId, rawResponse: data },
      });
    }
    return { success: true, paymentId, paymentMethodType, rawResponse: data };
  },
});

router.post("/getPaymentClientConfig", getPaymentClientConfig);
router.post("/getPaymentResponse",     getPaymentResponse);
router.post("/processAdyenPayment",    processAdyenPayment);
router.post("/getPaymentMethodType",   getPaymentMethodType);

export default router;
