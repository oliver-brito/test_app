import { ENDPOINTS } from "../../../public/js/endpoints.js";

const { ORDER: ORDER_PATH } = ENDPOINTS;

/** Read the full Payment record (including provider-specific config) for the UI. */
export async function getPaymentDetails(ctx, paymentId) {
  return ctx.call(
    ORDER_PATH,
    { get: [`Payments::${paymentId}`], objectName: "myOrder" },
    "Checkout failed (get payment details)"
  );
}
