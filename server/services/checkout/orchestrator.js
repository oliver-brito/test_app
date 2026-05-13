// Composes the seven av-avon calls that make up the /checkout flow.
// Each step either returns its result or throws ApiError; the central
// error middleware formats the response so this file stays linear.

import { createCheckoutContext } from "./context.js";
import { getCustomerId } from "./getCustomerId.js";
import { addCustomer } from "./addCustomer.js";
import { ensurePayment } from "./ensurePayment.js";
import { setDeliveryAndPayment } from "./setDeliveryAndPayment.js";
import { getClientToken } from "./getClientToken.js";
import { getPaymentDetails } from "./getPaymentDetails.js";

export async function runCheckoutSequence(res, { deliveryMethod, paymentMethod, paResponseURL }) {
  const ctx = createCheckoutContext(res);

  const customerId = await getCustomerId(ctx);
  await addCustomer(ctx, customerId);

  const paymentId = await ensurePayment(ctx);
  await setDeliveryAndPayment(ctx, { paymentId, deliveryMethod, paymentMethod });
  await getClientToken(ctx, { paymentId, paResponseURL });
  const details = await getPaymentDetails(ctx, paymentId);

  // backendApiCalls is auto-attached by the handler factory (from the
  // AsyncLocalStorage trail), so we don't return it here explicitly.
  return {
    success: true,
    paymentId,
    paymentDetails: details.data?.data?.[`Payments::${paymentId}`],
  };
}
