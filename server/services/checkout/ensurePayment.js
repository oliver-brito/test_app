import { ENDPOINTS } from "../../../public/js/endpoints.js";
import { printDebugMessage } from "../../utils/debug.js";

const { ORDER: ORDER_PATH } = ENDPOINTS;

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
 * Calls addPayment only when none exists. Returns null on failure (response
 * already sent by ctx.call or here).
 */
export async function ensurePayment(ctx) {
  const checkResult = await ctx.call(
    ORDER_PATH,
    { get: ["Payments"], objectName: "myOrder" },
    "Checkout failed (check payments)"
  );
  if (!checkResult) return null;

  let paymentsObj = checkResult.data?.data?.Payments || {};
  const hasPayment = Object.values(paymentsObj).some((v) => v?.payment_id?.standard);

  if (!hasPayment) {
    const addResult = await ctx.call(
      ORDER_PATH,
      { actions: [{ method: "addPayment" }], get: ["Payments"], objectName: "myOrder" },
      "Checkout failed (addPayment)"
    );
    if (!addResult) return null;
    paymentsObj = addResult.data?.data?.Payments || {};
  }

  const paymentId = extractPaymentId(paymentsObj);
  if (!paymentId) {
    printDebugMessage("No paymentID found after addPayment");
    ctx.res.status(500).json({
      error: "No paymentID found after addPayment",
      details: paymentsObj,
      backendApiCalls: ctx.apiCalls,
    });
    return null;
  }

  return paymentId;
}
