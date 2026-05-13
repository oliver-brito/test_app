// Fluent builder for av-avon API calls. Every server-side call to
// AudienceView goes through this — `callAv` / `callAvManaged` are gone.
//
//   await av                                 // start
//     .on(MY_ORDER)                          // configure objectName
//     .get(field, field, ...)                // append payload.get
//     .set({ [field]: value })               // merge payload.set
//     .action(METHOD, params?, { acceptWarnings? })
//                                            // append payload.actions
//     .manual()                              // don't follow redirects
//     .surfaceThreeDS()                      // 4294 is not an error
//     .post(PATH)                            // target av-avon endpoint
//     .orFail("message");                    // throw ApiError on !response.ok
//
// Two terminal modes:
//   await av...post(P)             → { response, data, apiCallMetadata }  (raw)
//   await av...post(P).orFail(M)   → same triple, but throws ApiError on failure
//
// Each chained method returns a new (frozen) builder, so partial chains
// can be safely composed. Execution happens only when the builder is
// awaited (the builder is "thenable").

import { getApiBase, CURRENT_SESSION } from "../utils/sessionStore.js";
import { authHeaders } from "../utils/authHeaders.js";
import { logApiCall, printDebugMessage } from "../utils/debug.js";
import { mirrorSetCookies } from "./cookieSync.js";
import { parseResponse } from "./avResponse.js";
import { classifyException } from "./apiErrors.js";
import { ApiError } from "../middleware/errorHandler.js";

const EMPTY_STATE = Object.freeze({
  objectName: undefined,
  get: Object.freeze([]),
  set: Object.freeze({}),
  actions: Object.freeze([]),
  path: undefined,
  manual: false,
  surfaceThreeDS: false,
  orFailMessage: undefined,
});

/** Active av-avon base URL: user-supplied at /login, falling back to .env. */
function resolveApiBase() {
  return getApiBase() || process.env.API_BASE || "";
}

/** True if a session exists and the API base is resolved. */
export function hasActiveSession() {
  return Boolean(CURRENT_SESSION && resolveApiBase());
}

class AvBuilder {
  constructor(state) {
    this._state = state;
  }
  _with(patch) {
    return new AvBuilder(Object.freeze({ ...this._state, ...patch }));
  }

  on(objectName) {
    return this._with({ objectName });
  }
  get(...fields) {
    return this._with({ get: [...this._state.get, ...fields] });
  }
  set(obj) {
    return this._with({ set: { ...this._state.set, ...obj } });
  }
  action(method, params, opts = {}) {
    const next = { method };
    if (params !== undefined) next.params = params;
    if (opts.acceptWarnings) next.acceptWarnings = opts.acceptWarnings;
    return this._with({ actions: [...this._state.actions, next] });
  }
  manual() {
    return this._with({ manual: true });
  }
  surfaceThreeDS() {
    return this._with({ surfaceThreeDS: true });
  }
  post(path) {
    return this._with({ path });
  }
  orFail(message) {
    return this._with({ orFailMessage: message });
  }

  // Thenable: awaiting the builder triggers execution.
  then(onResolve, onReject) {
    return this._run().then(onResolve, onReject);
  }
  catch(onReject) {
    return this._run().catch(onReject);
  }
  finally(onFinally) {
    return this._run().finally(onFinally);
  }

  _run() {
    const s = this._state;
    if (!s.path) {
      return Promise.reject(new Error("av: missing .post(path) before await"));
    }
    const payload = {};
    if (s.objectName) payload.objectName = s.objectName;
    if (s.get.length) payload.get = [...s.get];
    if (Object.keys(s.set).length) payload.set = { ...s.set };
    if (s.actions.length) payload.actions = [...s.actions];

    return _execute(s.path, payload, {
      manual: s.manual,
      surfaceThreeDS: s.surfaceThreeDS,
      orFailMessage: s.orFailMessage,
    });
  }
}

/** Title used by the UI debug console to label each request. */
function apiCallTitle(payload) {
  const methods = (payload.actions || [])
    .map((a) => a.method)
    .filter(Boolean)
    .join(", ");
  if (methods) return methods;
  if (Array.isArray(payload.get) && payload.get.length) return `get ${payload.get.join(", ")}`;
  if (payload.set && Object.keys(payload.set).length) {
    return `set ${Object.keys(payload.set).join(", ")}`;
  }
  return "API call";
}

function buildApiCallMetadata({ url, path, payload, response, data, durationMs }) {
  return {
    method: "POST",
    endpoint: url,
    path,
    title: apiCallTitle(payload),
    status: response.status,
    duration: durationMs,
    request: { body: payload, timestamp: new Date().toISOString() },
    response: data,
  };
}

/**
 * Internal: actually perform the av-avon round-trip. Exported so tests
 * can mock the entire I/O surface from a single point.
 *
 * @param {string} path
 * @param {object} payload
 * @param {{ manual?: boolean, surfaceThreeDS?: boolean, orFailMessage?: string }} opts
 */
export async function _execute(path, payload, opts = {}) {
  const apiBase = resolveApiBase();
  if (!apiBase) throw new ApiError(500, "API_BASE is not defined");

  const url = `${apiBase}${path}`;
  const headers = {
    ...authHeaders(),
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  logApiCall(path, { url, method: "POST", headers, body: payload });

  const startedAt = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(payload),
    redirect: opts.manual ? "manual" : "follow",
  });
  await mirrorSetCookies(response);
  const data = await parseResponse(response);
  const durationMs = Date.now() - startedAt;

  logApiCall(path, { body: payload }, response, data);

  const apiCallMetadata = buildApiCallMetadata({
    url,
    path,
    payload,
    response,
    data,
    durationMs,
  });
  const result = { response, data, apiCallMetadata };

  if (opts.orFailMessage && !response.ok) {
    if (opts.surfaceThreeDS && classifyException(data) === "threeDS") {
      printDebugMessage("3DS authentication required");
      return { ...result, requires3ds: true };
    }
    throw new ApiError(response.status, opts.orFailMessage, {
      endpoint: path,
      requestPayload: payload,
      details: data,
      apiCallMetadata,
    });
  }
  return result;
}

/** The singleton builder root. Import as `import { av } from "../services/av.js"`. */
export const av = new AvBuilder(EMPTY_STATE);
