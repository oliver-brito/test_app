// Builds the default headers attached to every outbound av-avon request:
// Accept + Content-Type plus the session token and cookie jar mirrored
// back into the session store by services/cookieSync.js.

import { CURRENT_SESSION, CURRENT_COOKIES } from "../utils/sessionStore.js";
import { filterCookieHeader } from "./cookieUtils.js";

/**
 * @param {Record<string,string>} [extra]  caller-supplied headers, merged last
 * @returns {Record<string,string>}
 */
export function authHeaders(extra = {}) {
  const base = {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
  };

  if (CURRENT_SESSION) base.Session = CURRENT_SESSION;
  if (CURRENT_COOKIES) base.Cookie = filterCookieHeader(CURRENT_COOKIES);
  return { ...base, ...extra };
}
