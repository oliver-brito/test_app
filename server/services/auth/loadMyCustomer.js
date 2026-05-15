// Step 3 of /login: invoke Customer.load with the resolved customer_id so
// that subsequent calls in this session can reference `myCustomer`.
//
// A failure here is non-fatal — we log it but don't block the login.

import { ENDPOINTS } from "../../../public/js/endpoints.js";
import { parseResponse } from "../avResponse.js";
import { isDebugMode } from "../../utils/debug.js";
import { recordApiCall } from "../requestContext.js";
import { MY_CUSTOMER } from "../../av/objectNames.js";
import { LOAD } from "../../av/methods.js";
import { CUSTOMER_ID, CUSTOMER, PAYMENTS, CONTACTS, ADDRESSES } from "../../av/fields.js";

const JSON_HEADERS = { Accept: "application/json", "Content-Type": "application/json" };

/**
 * @returns {Promise<{ customerData: any, apiCallMetadata: object }>}
 *   Never throws — a load failure is treated as a warning.
 */
export async function loadMyCustomer({ apiBase, cookies, customerId }) {
  const url = new URL(ENDPOINTS.CUSTOMER, apiBase).toString();
  const body = {
    actions: [{ method: LOAD, params: { [CUSTOMER_ID]: customerId } }],
    objectName: MY_CUSTOMER,
    get: [CUSTOMER, PAYMENTS, CONTACTS, ADDRESSES],
  };

  const startedAt = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers: { ...JSON_HEADERS, Cookie: cookies },
    body: JSON.stringify(body),
  });
  const customerData = await parseResponse(response);
  const duration = Date.now() - startedAt;

  const apiCallMetadata = {
    request: {
      method: "POST",
      endpoint: url,
      headers: { ...JSON_HEADERS, Cookie: cookies },
      body,
      timestamp: new Date().toISOString(),
    },
    response: customerData,
    duration,
  };
  recordApiCall(apiCallMetadata);

  if (!response.ok && isDebugMode()) {
    console.log("Warning: Customer load failed:", response.status);
  }

  return { customerData, apiCallMetadata };
}
