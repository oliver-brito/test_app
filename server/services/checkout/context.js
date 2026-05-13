import { callAvManaged } from "../avClient.js";

/**
 * Per-request context object threaded through the checkout steps. Owns the
 * Express response (for short-circuiting on failure), the collected backend
 * API call metadata (returned to the UI's debug console), and a `call`
 * helper that wraps makeApiCallWithErrorHandling and auto-records each call.
 */
export function createCheckoutContext(res) {
  const apiCalls = [];

  async function call(path, payload, errorMessage, options) {
    const result = await callAvManaged(res, path, payload, errorMessage, options);
    if (result?.apiCallMetadata) apiCalls.push(result.apiCallMetadata);
    return result;
  }

  return { res, apiCalls, call };
}
