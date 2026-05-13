// server/routes/threeDS.js — receives the PaRes payload from the Cardinal
// 3DS challenge and finalizes the order.
import express from "express";
import { ENDPOINTS } from "../../public/js/endpoints.js";
import { av } from "../services/av.js";
import { classifyException } from "../services/apiErrors.js";
import { unwrap } from "../services/avResponse.js";
import { handler } from "../middleware/handler.js";
import { ApiError } from "../middleware/errorHandler.js";
import { ProcessThreeDSResponseBody } from "../schemas/threeDS.js";
import { insertOrder, redirectToViewOrder } from "../services/order.js";
import { MY_ORDER } from "../av/objectNames.js";
import { PAYMENTS, ORDER_NUMBER, paymentField, PAYMENT_FIELDS } from "../av/fields.js";

const router = express.Router();
const { ORDER: ORDER_PATH } = ENDPOINTS;

const newTransactionId = () =>
  `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const processThreeDSResponse = handler({
  body: ProcessThreeDSResponseBody,
  async run({ paymentId, pa_response_information, pa_response_URL }, { res }) {
    // 1. Hand the PaRes back to av-avon.
    const setResponse = await av
      .on(MY_ORDER)
      .set({
        [paymentField(paymentId, PAYMENT_FIELDS.PA_RESPONSE_INFORMATION)]: pa_response_information,
        [paymentField(paymentId, PAYMENT_FIELDS.PA_RESPONSE_URL)]: pa_response_URL,
      })
      .get(PAYMENTS)
      .manual()
      .post(ORDER_PATH)
      .orFail("Failed to submit 3DS response");

    // 2. Re-insert the order — av-avon now has the PaRes and can complete the charge.
    const { response: actionsResp, data: actionsJson } = await insertOrder();

    if (!actionsResp.ok) {
      if (classifyException(actionsJson) === "cancelled") {
        return {
          success: false,
          cancelled: true,
          error: actionsJson?.exception?.message || "Payment was cancelled",
        };
      }
      throw new ApiError(actionsResp.status, "3DS finalization failed", {
        details: { status: actionsResp.status, body: actionsJson },
      });
    }

    const orderNumber =
      unwrap(actionsJson, ORDER_NUMBER)?.standard ||
      unwrap(setResponse.data, ORDER_NUMBER)?.standard ||
      null;

    redirectToViewOrder(
      {
        orderNumber,
        transactionId: newTransactionId(),
        actionsJson,
        respJson: setResponse.data,
        paymentMethod: "3DS Payment",
      },
      res
    );
    return; // response already sent
  },
});

router.post("/processThreeDSResponse", processThreeDSResponse);

export default router;
