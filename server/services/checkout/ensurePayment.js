import { ENDPOINTS } from "../../../public/js/endpoints.js";
import { MY_ORDER } from "../../av/objectNames.js";
import { ADD_PAYMENT } from "../../av/methods.js";
import { PAYMENTS } from "../../av/fields.js";
import { unwrap } from "../avResponse.js";
import { ApiError } from "../../middleware/errorHandler.js";

const { ORDER: ORDER_PATH } = ENDPOINTS;

/** First payment_id present in the Payments map, or null. */
function extractPaymentId(paymentsObj) {
  for (const [key, value] of Object.entries(paymentsObj)) {
    if (key !== "state" && value?.payment_id?.standard) {
      return value.payment_id.standard;
    }
  }
  return null;
}

/**
 * Ensure the order has at least one Payment record; return its payment_id.
 * Calls addPayment only when none exists. Throws ApiError(500) if no
 * payment_id is present even after addPayment.
 */
export async function ensurePayment(ctx) {
  const checkResult = await ctx.call(
    ORDER_PATH,
    { get: [PAYMENTS], objectName: MY_ORDER },
    "Checkout failed (check payments)"
  );

  let paymentsObj = unwrap(checkResult.data, PAYMENTS) || {};
  const hasPayment = Object.values(paymentsObj).some((v) => v?.payment_id?.standard);

  if (!hasPayment) {
    const addResult = await ctx.call(
      ORDER_PATH,
      { actions: [{ method: ADD_PAYMENT }], get: [PAYMENTS], objectName: MY_ORDER },
      "Checkout failed (addPayment)"
    );
    paymentsObj = unwrap(addResult.data, PAYMENTS) || {};
  }

  const paymentId = extractPaymentId(paymentsObj);
  if (!paymentId) {
    throw new ApiError(500, "No paymentId found after addPayment", {
      details: paymentsObj,
      backendApiCalls: ctx.apiCalls,
    });
  }
  return paymentId;
}
