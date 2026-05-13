// Per-request context object threaded through the checkout steps. Owns
// the collected API-call metadata (returned to the UI's debug console)
// and a `call` helper that wraps av._execute and auto-records each call —
// including the failing one when it throws.
//
// In Step 17b this whole context goes away in favor of an AsyncLocalStorage
// trail managed by the handler factory; for now it preserves the existing
// orchestrator API surface.

import { _execute } from "../av.js";

export function createCheckoutContext(res) {
  const apiCalls = [];

  async function call(path, payload, errorMessage, options = {}) {
    try {
      const result = await _execute(path, payload, {
        manual: options.manual,
        surfaceThreeDS: options.surfaceThreeDS,
        orFailMessage: errorMessage,
      });
      if (result?.apiCallMetadata) apiCalls.push(result.apiCallMetadata);
      return result;
    } catch (err) {
      if (err?.apiCallMetadata) apiCalls.push(err.apiCallMetadata);
      if (err) err.backendApiCalls = [...apiCalls];
      throw err;
    }
  }

  return { res, apiCalls, call };
}
