// HTTP client for av-avon. Every server-side call to the AudienceView API
// goes through one of:
//   - callAv(path, payload)         — low-level: returns { response, data, apiCallMetadata }
//                                     regardless of HTTP status. Caller decides.
//   - callAvManaged(path, payload)  — throws ApiError on non-2xx. The central
//                                     error middleware turns the throw into JSON.
//
// Both auto-attach Session + Cookie, mirror inbound Set-Cookie headers back
// into the session store, and record API-call metadata used by the
// browser-side debug console.

import { getApiBase, CURRENT_SESSION } from "../utils/sessionStore.js";
import { authHeaders } from "../utils/authHeaders.js";
import { logApiCall, printDebugMessage } from "../utils/debug.js";
import { mirrorSetCookies } from "./cookieSync.js";
import { parseResponse } from "./avResponse.js";
import { classifyException } from "./apiErrors.js";
import { ApiError } from "../middleware/errorHandler.js";

/** Active av-avon base URL: user-supplied at /login, falling back to .env. */
function resolveApiBase() {
  return getApiBase() || process.env.API_BASE || "";
}

/** True if a session exists and the API base is resolved. */
export function hasActiveSession() {
  return Boolean(CURRENT_SESSION && resolveApiBase());
}

/** Build a one-line "title" for an API call (used by the debug console UI). */
function apiCallTitle(payload) {
  const methods = (payload.actions || [])
    .map((a) => a.method)
    .filter(Boolean)
    .join(", ");
  if (methods) return methods;
  if (Array.isArray(payload.get) && payload.get.length) return `get ${payload.get.join(", ")}`;
  if (payload.set && Object.keys(payload.set).length)
    return `set ${Object.keys(payload.set).join(", ")}`;
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
 * POST to av-avon at `path` with `payload`. Returns the full result triple
 * regardless of HTTP status — callers decide how to react to !response.ok.
 *
 * @param {string} path                 av-avon endpoint path (from ENDPOINTS)
 * @param {object} payload              JSON body
 * @param {{ manual?: boolean }} [opts] manual: don't follow redirects
 * @returns {Promise<{ response: Response, data: any, apiCallMetadata: object }>}
 */
export async function callAv(path, payload, { manual = false } = {}) {
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
    redirect: manual ? "manual" : "follow",
  });
  await mirrorSetCookies(response);
  const data = await parseResponse(response);
  const durationMs = Date.now() - startedAt;

  logApiCall(path, { body: payload }, response, data);

  return {
    response,
    data,
    apiCallMetadata: buildApiCallMetadata({ url, path, payload, response, data, durationMs }),
  };
}

/**
 * High-level helper: call av-avon and **throw `ApiError`** on failure. The
 * central error middleware renders the JSON response (uniformly shaped,
 * including any apiCallMetadata trail).
 *
 * When `surfaceThreeDS` is true, a 4294 (3DS-required) failure is NOT
 * an error; it's returned with `requires3ds: true` so the caller can
 * launch the challenge flow explicitly.
 *
 * @param {string} path
 * @param {object} payload
 * @param {string} errorMessage           message attached to ApiError on failure
 * @param {{ manual?: boolean, surfaceThreeDS?: boolean }} [opts]
 */
export async function callAvManaged(path, payload, errorMessage, opts = {}) {
  const { manual = false, surfaceThreeDS = false } = opts;
  const result = await callAv(path, payload, { manual });
  const { response, data, apiCallMetadata } = result;

  if (response.ok) return result;

  if (surfaceThreeDS && classifyException(data) === "threeDS") {
    printDebugMessage("3DS authentication required");
    return { ...result, requires3ds: true };
  }

  throw new ApiError(response.status, errorMessage, {
    endpoint: path,
    requestPayload: payload,
    details: data,
    apiCallMetadata,
  });
}
