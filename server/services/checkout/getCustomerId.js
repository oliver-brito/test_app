import { ENDPOINTS } from "../../../public/js/endpoints.js";

const { CUSTOMER: CUSTOMER_PATH } = ENDPOINTS;

/**
 * Read the customer_id off the active session's myCustomer object.
 * Returns the id string, or null if the upstream call failed (response
 * already sent by ctx.call) or no id was present (sends 400 here).
 */
export async function getCustomerId(ctx) {
  const result = await ctx.call(
    CUSTOMER_PATH,
    { get: ["Customer::customer_id"], objectName: "myCustomer" },
    "Customer not found for user"
  );
  if (!result) return null;

  const customerId = result.data?.data?.["Customer::customer_id"]?.standard;
  if (!customerId) {
    ctx.res.status(400).json({ error: "Could not retrieve customer ID from session" });
    return null;
  }
  return customerId;
}
