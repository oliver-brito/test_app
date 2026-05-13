// server/routes/threeDS.js — receives the PaRes payload from the Cardinal
// 3DS challenge and finalizes the order.
import express from "express";
import { ENDPOINTS } from "../../public/js/endpoints.js";
import { callAvManaged } from "../services/avClient.js";
import { classifyException } from "../services/apiErrors.js";
import { unwrap } from "../services/avResponse.js";
import { validate } from "../middleware/validate.js";
import { ProcessThreeDSResponseBody } from "../schemas/threeDS.js";
import { insertOrder, redirectToViewOrder } from "../services/order.js";
import { MY_ORDER } from "../av/objectNames.js";
import { PAYMENTS, ORDER_NUMBER, paymentField, PAYMENT_FIELDS } from "../av/fields.js";

const router = express.Router();
const { ORDER: ORDER_PATH } = ENDPOINTS;

const newTransactionId = () =>
  `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

router.post(
  "/processThreeDSResponse",
  express.json(),
  validate(ProcessThreeDSResponseBody),
  async (req, res) => {
    const { paymentId, pa_response_information, pa_response_URL } = req.body;

    // 1. Hand the PaRes back to av-avon.
    const setResponse = await callAvManaged(
      res,
      ORDER_PATH,
      {
        set: {
          [paymentField(paymentId, PAYMENT_FIELDS.PA_RESPONSE_INFORMATION)]: pa_response_information,
          [paymentField(paymentId, PAYMENT_FIELDS.PA_RESPONSE_URL)]: pa_response_URL,
        },
        objectName: MY_ORDER,
        get: [PAYMENTS],
      },
      "Failed to submit 3DS response",
      { manual: true }
    );
    if (!setResponse) return;

    const backendApiCalls = setResponse.apiCallMetadata ? [setResponse.apiCallMetadata] : [];

    // 2. Re-insert the order — av-avon now has the PaRes and can complete the charge.
    const { response: actionsResp, data: actionsJson } = await insertOrder();

    if (!actionsResp.ok) {
      if (classifyException(actionsJson) === "cancelled") {
        return res.json({
          success: false,
          cancelled: true,
          error: actionsJson?.exception?.message || "Payment was cancelled",
        });
      }
      return res.status(actionsResp.status).json({
        status: actionsResp.status,
        body: actionsJson,
        backendApiCalls,
      });
    }

    const orderNumber =
      unwrap(actionsJson, ORDER_NUMBER)?.standard ||
      unwrap(setResponse.data, ORDER_NUMBER)?.standard ||
      null;

    return redirectToViewOrder(
      {
        orderNumber,
        transactionId: newTransactionId(),
        actionsJson,
        respJson: setResponse.data,
        paymentMethod: "3DS Payment",
        backendApiCalls,
      },
      res
    );
  }
);

export default router;
