// Order-level helpers shared by every payment flow.

import { ENDPOINTS } from "../../public/js/endpoints.js";
import { av } from "./av.js";
import { ACCEPTED_WARNINGS } from "../constants.js";
import { MY_ORDER } from "../av/objectNames.js";
import { INSERT } from "../av/methods.js";
import { ORDER, ADMISSIONS, PAYMENTS, ORDER_NUMBER } from "../av/fields.js";

const { ORDER: ORDER_PATH } = ENDPOINTS;

/**
 * Submit the active order (myOrder.insert). Used at the end of the Adyen,
 * 3DS, and generic /transaction flows. The accepted warning codes
 * correspond to soft warnings av-avon emits that we treat as success.
 */
export async function insertOrder({ resetPaymentAttempt = false } = {}) {
  const insertParams = { notification: "correspondence" };
  if (resetPaymentAttempt) insertParams.resetPaymentAttempt = "1";

  return av
    .on(MY_ORDER)
    .action(INSERT, insertParams, { acceptWarnings: ACCEPTED_WARNINGS.INSERT_ORDER })
    .get(ORDER, ADMISSIONS, PAYMENTS, ORDER_NUMBER)
    .manual()
    .post(ORDER_PATH);
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
