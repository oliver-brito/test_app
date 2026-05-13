// Per-request context backed by AsyncLocalStorage. Holds the trail of
// av-avon calls a single HTTP request made; surfaced back to the
// browser-side debug console under `backendApiCalls` in every response.
//
// The handler factory (server/middleware/handler.js) wraps each request
// in `runWithRequestContext(...)`; the av builder's terminal calls
// `recordApiCall(...)` after every av-avon round-trip.

import { AsyncLocalStorage } from "node:async_hooks";

const store = new AsyncLocalStorage();

/** Run `fn` with a fresh empty trail in scope. */
export function runWithRequestContext(fn) {
  return store.run({ apiCalls: [] }, fn);
}

/** Append an apiCallMetadata record to the active request's trail (no-op outside a request). */
export function recordApiCall(metadata) {
  store.getStore()?.apiCalls.push(metadata);
}

/** Snapshot the active request's trail (empty array outside a request). */
export function getApiCalls() {
  return store.getStore()?.apiCalls ?? [];
}
