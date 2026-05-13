import { ENDPOINTS } from "../../../public/js/endpoints.js";

const { ORDER: ORDER_PATH } = ENDPOINTS;

/** Attach the customer to the active order (myOrder). */
export async function addCustomer(ctx, customerId) {
  return ctx.call(
    ORDER_PATH,
    {
      actions: [{ method: "addCustomer", params: { "Customer::customer_id": customerId } }],
      get: ["Order::order_number", "Payments"],
      objectName: "myOrder",
    },
    "Checkout failed (addCustomer)"
  );
}
