// server/routes/threeDS.js
import express from "express";
import { ENDPOINTS } from "../../public/js/endpoints.js";
import { makeApiCallWithErrorHandling } from "../utils/common.js";
import { classifyException } from "../services/apiErrors.js";
import { insertOrder, redirectToViewOrder } from "./common.js";

const router = express.Router();
const { ORDER: ORDER_PATH } = ENDPOINTS;

router.post("/processThreeDSResponse", express.json(), async (req, res) => {
  const { paymentId, pa_response_information, pa_response_URL } = req.body;
  const paymentsKeyBase = `Payments::${paymentId}`;

  // Submit the 3DS response (PARes payload + return URL) to av-avon.
  const outboundBody = {
    set: {
      [`${paymentsKeyBase}::pa_response_information`]: pa_response_information,
      [`${paymentsKeyBase}::pa_response_URL`]: pa_response_URL,
    },
    objectName: "myOrder",
    get: ["Payments"],
  };

  const result = await makeApiCallWithErrorHandling(
    res, ORDER_PATH, outboundBody, "Failed to submit 3DS response", { manual: true }
  );
  if (!result) return;

  const backendApiCalls = [];
  if (result.apiCallMetadata) backendApiCalls.push(result.apiCallMetadata);

  // Finalize the order; insertOrder now sees the PARes payload set above.
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
    actionsJson?.data?.["Order::order_number"]?.standard ||
    result.data?.data?.["Order::order_number"]?.standard ||
    null;
  const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  return redirectToViewOrder(
    {
      orderNumber,
      transactionId,
      actionsJson,
      respJson: result.data,
      paymentMethod: "3DS Payment",
      backendApiCalls,
    },
    res
  );
});

export default router;