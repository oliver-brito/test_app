// Checkout step 4: set the chosen delivery method on the order and assign
// the chosen payment method (plus cardholder placeholder) to the Payment.

import { ENDPOINTS } from "../../../public/js/endpoints.js";
import { DEFAULT_CARDHOLDER_NAME } from "../../constants.js";
import { MY_ORDER } from "../../av/objectNames.js";
import {
  ORDER_DELIVERY_METHOD_ID,
  ORDER_NUMBER,
  PAYMENTS,
  paymentField,
  PAYMENT_FIELDS,
} from "../../av/fields.js";

const { ORDER: ORDER_PATH } = ENDPOINTS;

/** Set the chosen delivery method and assign the payment method to the Payment record. */
export async function setDeliveryAndPayment(ctx, { paymentId, deliveryMethod, paymentMethod }) {
  return ctx.call(
    ORDER_PATH,
    {
      set: {
        [ORDER_DELIVERY_METHOD_ID]: deliveryMethod,
        [paymentField(paymentId, PAYMENT_FIELDS.ACTIVE_PAYMENT)]: paymentMethod,
        [paymentField(paymentId, PAYMENT_FIELDS.SWIPE_INDICATOR)]: "Internet",
        [paymentField(paymentId, PAYMENT_FIELDS.CARDHOLDER_NAME)]: DEFAULT_CARDHOLDER_NAME,
      },
      get: [ORDER_NUMBER, PAYMENTS],
      objectName: MY_ORDER,
    },
    "Checkout failed (set delivery/payment)"
  );
}
