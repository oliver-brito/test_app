import { ENDPOINTS } from "../../../public/js/endpoints.js";
import { MY_CUSTOMER } from "../../av/objectNames.js";
import { CUSTOMER_ID } from "../../av/fields.js";
import { unwrap } from "../avResponse.js";

const { CUSTOMER: CUSTOMER_PATH } = ENDPOINTS;

/**
 * Read the customer_id off the active session's myCustomer object.
 * Returns the id string, or null if the upstream call failed (response
 * already sent by ctx.call) or no id was present (sends 400 here).
 */
export async function getCustomerId(ctx) {
  const result = await ctx.call(
    CUSTOMER_PATH,
    { get: [CUSTOMER_ID], objectName: MY_CUSTOMER },
    "Customer not found for user"
  );
  if (!result) return null;

  const customerId = unwrap(result.data, CUSTOMER_ID)?.standard;
  if (!customerId) {
    ctx.res.status(400).json({ error: "Could not retrieve customer ID from session" });
    return null;
  }
  return customerId;
}
