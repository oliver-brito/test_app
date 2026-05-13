import { ENDPOINTS } from "../../../public/js/endpoints.js";
import { printDebugMessage } from "../../utils/debug.js";
import { MY_ORDER } from "../../av/objectNames.js";
import { ADD_PAYMENT } from "../../av/methods.js";
import { PAYMENTS } from "../../av/fields.js";
import { unwrap } from "../avResponse.js";

const { ORDER: ORDER_PATH } = ENDPOINTS;

/** Pull the first Payment record's payment_id, or null when the map is empty. */
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
 * Calls addPayment only when none exists. Returns null on failure (the
 * upstream error response has already been sent via ctx.call, or sent here).
 */
export async function ensurePayment(ctx) {
  const checkResult = await ctx.call(
    ORDER_PATH,
    { get: [PAYMENTS], objectName: MY_ORDER },
    "Checkout failed (check payments)"
  );
  if (!checkResult) return null;

  let paymentsObj = unwrap(checkResult.data, PAYMENTS) || {};
  const hasPayment = Object.values(paymentsObj).some((v) => v?.payment_id?.standard);

  if (!hasPayment) {
    const addResult = await ctx.call(
      ORDER_PATH,
      { actions: [{ method: ADD_PAYMENT }], get: [PAYMENTS], objectName: MY_ORDER },
      "Checkout failed (addPayment)"
    );
    if (!addResult) return null;
    paymentsObj = unwrap(addResult.data, PAYMENTS) || {};
  }

  const paymentId = extractPaymentId(paymentsObj);
  if (!paymentId) {
    printDebugMessage("No paymentId found after addPayment");
    ctx.res.status(500).json({
      error: "No paymentId found after addPayment",
      details: paymentsObj,
      backendApiCalls: ctx.apiCalls,
    });
    return null;
  }

  return paymentId;
}
