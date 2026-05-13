import { ENDPOINTS } from "../../../public/js/endpoints.js";
import { DEFAULT_CARDHOLDER_NAME } from "../../constants.js";

const { ORDER: ORDER_PATH } = ENDPOINTS;

/** Set the chosen delivery method and assign the payment method to the Payment record. */
export async function setDeliveryAndPayment(ctx, { paymentId, deliveryMethod, paymentMethod }) {
  return ctx.call(
    ORDER_PATH,
    {
      set: {
        "Order::deliverymethod_id": deliveryMethod,
        [`Payments::${paymentId}::active_payment`]: paymentMethod,
        [`Payments::${paymentId}::swipe_indicator`]: "Internet",
        [`Payments::${paymentId}::cardholder_name`]: DEFAULT_CARDHOLDER_NAME,
      },
      get: ["Order::order_number", "Payments"],
      objectName: "myOrder",
    },
    "Checkout failed (set delivery/payment)"
  );
}
