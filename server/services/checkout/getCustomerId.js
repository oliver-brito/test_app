import { ENDPOINTS } from "../../../public/js/endpoints.js";
import { MY_CUSTOMER } from "../../av/objectNames.js";
import { CUSTOMER_ID } from "../../av/fields.js";
import { unwrap } from "../avResponse.js";
import { ApiError } from "../../middleware/errorHandler.js";

const { CUSTOMER: CUSTOMER_PATH } = ENDPOINTS;

/**
 * Read the customer_id off the active session's myCustomer object.
 * Throws ApiError(400) if the session has no customer attached.
 */
export async function getCustomerId(ctx) {
  const result = await ctx.call(
    CUSTOMER_PATH,
    { get: [CUSTOMER_ID], objectName: MY_CUSTOMER },
    "Customer not found for user"
  );

  const customerId = unwrap(result.data, CUSTOMER_ID)?.standard;
  if (!customerId) {
    throw new ApiError(400, "Could not retrieve customer ID from session", {
      backendApiCalls: ctx.apiCalls,
    });
  }
  return customerId;
}
