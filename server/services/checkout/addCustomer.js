// Checkout step 2: attach the resolved customer to the active order.

import { ENDPOINTS } from "../../../public/js/endpoints.js";
import { MY_ORDER } from "../../av/objectNames.js";
import { ADD_CUSTOMER } from "../../av/methods.js";
import { CUSTOMER_ID, ORDER_NUMBER, PAYMENTS } from "../../av/fields.js";

const { ORDER: ORDER_PATH } = ENDPOINTS;

/** Attach the customer to the active order (myOrder). */
export async function addCustomer(ctx, customerId) {
  return ctx.call(
    ORDER_PATH,
    {
      actions: [{ method: ADD_CUSTOMER, params: { [CUSTOMER_ID]: customerId } }],
      get: [ORDER_NUMBER, PAYMENTS],
      objectName: MY_ORDER,
    },
    "Checkout failed (addCustomer)"
  );
}
