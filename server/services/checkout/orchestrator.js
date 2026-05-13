import { createCheckoutContext } from "./context.js";
import { getCustomerId } from "./getCustomerId.js";
import { addCustomer } from "./addCustomer.js";
import { ensurePayment } from "./ensurePayment.js";
import { setDeliveryAndPayment } from "./setDeliveryAndPayment.js";
import { getClientToken } from "./getClientToken.js";
import { getPaymentDetails } from "./getPaymentDetails.js";

/**
 * Runs the full /checkout sequence. Returns the result payload the route
 * should send, or null if a step already wrote an error response to `res`.
 *
 * Each step short-circuits to null on failure (response already sent), so
 * the orchestrator just reads top-to-bottom — there's no error plumbing.
 */
export async function runCheckoutSequence(res, { deliveryMethod, paymentMethod, paResponseURL }) {
  const ctx = createCheckoutContext(res);

  const customerId = await getCustomerId(ctx);
  if (!customerId) return null;

  if (!(await addCustomer(ctx, customerId))) return null;

  const paymentId = await ensurePayment(ctx);
  if (!paymentId) return null;

  if (!(await setDeliveryAndPayment(ctx, { paymentId, deliveryMethod, paymentMethod }))) return null;
  if (!(await getClientToken(ctx, { paymentId, paResponseURL }))) return null;

  const details = await getPaymentDetails(ctx, paymentId);
  if (!details) return null;

  return {
    paymentID: paymentId,
    payment_details: details.data?.data?.[`Payments::${paymentId}`],
    backendApiCalls: ctx.apiCalls,
  };
}
