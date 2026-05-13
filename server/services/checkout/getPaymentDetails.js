// Checkout step 6: fetch the full Payment record (including provider-specific
// config the UI needs to render the payment widget).

import { ENDPOINTS } from "../../../public/js/endpoints.js";
import { MY_ORDER } from "../../av/objectNames.js";

const { ORDER: ORDER_PATH } = ENDPOINTS;

/** Read the full Payment record for the UI. */
export async function getPaymentDetails(ctx, paymentId) {
  return ctx.call(
    ORDER_PATH,
    { get: [`Payments::${paymentId}`], objectName: MY_ORDER },
    "Checkout failed (get payment details)"
  );
}
