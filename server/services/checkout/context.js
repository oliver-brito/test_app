// Per-request context object threaded through the checkout steps. Owns the
// collected API-call metadata (returned to the UI's debug console) and a
// `call` helper that wraps callAvManaged and auto-records each call —
// including the failing one when the helper throws.

import { callAvManaged } from "../avClient.js";

export function createCheckoutContext(res) {
  const apiCalls = [];

  async function call(path, payload, errorMessage, options) {
    try {
      const result = await callAvManaged(path, payload, errorMessage, options);
      if (result?.apiCallMetadata) apiCalls.push(result.apiCallMetadata);
      return result;
    } catch (err) {
      // Capture the failed call too, then attach the whole trail so the
      // error middleware can hand it to the UI's debug console.
      if (err?.apiCallMetadata) apiCalls.push(err.apiCallMetadata);
      if (err) err.backendApiCalls = [...apiCalls];
      throw err;
    }
  }

  return { res, apiCalls, call };
}
