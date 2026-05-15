// Step 2 of /login: POST to av-avon's /user with `{ session: { get: ["customer_id"] } }`
// to retrieve the customer_id attached to the logged-in user.
//
// The session is established but the av-avon objects (myCustomer, etc.)
// aren't loaded yet — so this is still a manual fetch using the cookies
// we got from authenticate().

import { ENDPOINTS } from "../../../public/js/endpoints.js";
import { parseResponse, unwrap } from "../avResponse.js";
import { ApiError } from "../../middleware/errorHandler.js";
import { recordApiCall } from "../requestContext.js";
import { SESSION_CUSTOMER_ID } from "../../av/fields.js";

const JSON_HEADERS = { Accept: "application/json", "Content-Type": "application/json" };

/**
 * @returns {Promise<{ customerId: string, data: any, apiCallMetadata: object }>}
 * @throws {ApiError} when the user has no customer_id attached.
 */
export async function loadSessionCustomerId({ apiBase, cookies }) {
  const url = new URL(ENDPOINTS.USER, apiBase).toString();
  const body = { session: { get: [SESSION_CUSTOMER_ID] } };

  const startedAt = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers: { ...JSON_HEADERS, Cookie: cookies },
    body: JSON.stringify(body),
  });
  const data = await parseResponse(response);
  const duration = Date.now() - startedAt;

  const apiCallMetadata = {
    method: "POST",
    endpoint: url,
    status: response.status,
    duration,
    request: {
      method: "POST",
      endpoint: url,
      headers: { ...JSON_HEADERS, Cookie: cookies },
      body,
      timestamp: new Date().toISOString(),
    },
    response: data,
  };
  recordApiCall(apiCallMetadata);

  const customerId = unwrap(data, SESSION_CUSTOMER_ID)?.standard?.trim() || "";
  if (!customerId) {
    throw new ApiError(400, "Please log in with a user that has a customer assigned to it", {
      endpoint: url,
      details: "No customer_id found for this user",
      apiCallMetadata,
    });
  }

  return { customerId, data, apiCallMetadata };
}
