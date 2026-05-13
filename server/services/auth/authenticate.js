// Step 1 of /login: POST credentials to av-avon's session/authenticateUser
// endpoint and capture the session id + the Set-Cookie pairs.
//
// Has to bypass callAv() because no session exists yet — the response of
// this very call is what establishes one.

import { ENDPOINTS } from "../../../public/js/endpoints.js";
import { parseResponse } from "../avResponse.js";
import { filterCookieHeader } from "../../utils/cookieUtils.js";
import { ApiError } from "../../middleware/errorHandler.js";

const JSON_HEADERS = { Accept: "application/json", "Content-Type": "application/json" };

/**
 * @returns {Promise<{
 *   session: string,
 *   cookies: string,
 *   version: any,
 *   data: any,
 *   apiCallMetadata: object
 * }>}
 * @throws {ApiError} when av-avon rejects the credentials (or any non-2xx).
 */
export async function authenticate({ apiBase, username, password }) {
  const url = new URL(ENDPOINTS.AUTH, apiBase).toString();
  const body = { userid: username, password };

  const startedAt = Date.now();
  const response = await fetch(url, {
    method: "POST",
    headers: JSON_HEADERS,
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
      headers: JSON_HEADERS,
      body,
      timestamp: new Date().toISOString(),
    },
    response: data,
  };

  if (!response.ok || !data?.session) {
    throw new ApiError(response.status || 500, "Auth failed", {
      endpoint: url,
      details: data,
      apiCallMetadata,
    });
  }

  const setCookie = response.headers.get("set-cookie");
  const cookies = setCookie ? filterCookieHeader(setCookie) : `session=${data.session}`;

  return { session: data.session, cookies, version: data.version, data, apiCallMetadata };
}
