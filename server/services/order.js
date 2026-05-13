import { ENDPOINTS } from "../../public/js/endpoints.js";
import { makeApiCall } from "../utils/common.js";
import { ACCEPTED_WARNINGS } from "../constants.js";

const { ORDER: ORDER_PATH } = ENDPOINTS;

/**
 * Submit the active order (myOrder.insert). Used at the end of the various
 * payment flows (Adyen, 3DS, generic /transaction). The accepted warning
 * codes correspond to soft errors av-avon emits that we treat as success.
 */
export async function insertOrder({ resetPaymentAttempt = false } = {}) {
  const insertParams = { notification: "correspondence" };
  if (resetPaymentAttempt) insertParams.resetPaymentAttempt = "1";

  return makeApiCall(
    ORDER_PATH,
    {
      actions: [
        { method: "insert", params: insertParams, acceptWarnings: ACCEPTED_WARNINGS.INSERT_ORDER },
      ],
      objectName: "myOrder",
      get: ["Order", "Admissions", "Payments", "Order::order_number"],
    },
    true
  );
}

/**
 * Build the JSON payload the UI expects after a successful order: a
 * redirect URL to viewOrder.html plus a `transactionDetails` envelope used
 * by the confirmation page.
 */
export function redirectToViewOrder(orderData, res) {
  const { orderNumber, transactionId, actionsJson, respJson, paymentMethod } = orderData;
  return res.json({
    success: true,
    redirectUrl: `/viewOrder.html?orderId=${orderNumber || transactionId}&transactionId=${transactionId}`,
    transactionDetails: {
      success: true,
      transactionId,
      orderId: orderNumber || transactionId,
      timestamp: new Date().toISOString(),
      paymentMethod: paymentMethod || "N/A",
      status: "completed",
      updateResult: respJson,
      actionsResult: actionsJson,
    },
  });
}
