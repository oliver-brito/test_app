// Outbound cookie mirror: when av-avon sends a Set-Cookie header on a
// response, copy those cookie pairs into the in-memory session store so the
// next call out attaches them. This is the av-avon side of the session;
// inbound cookies from the browser are handled by `cookie-parser`.

import { getCookies, setCookies } from "../utils/sessionStore.js";
import { parseSetCookieHeader, mergeCookiePairs } from "../utils/cookieUtils.js";

/** Merge any Set-Cookie pairs from `response` into the session cookie jar. */
export async function mirrorSetCookies(response) {
  const setCookie = response.headers.get("set-cookie");
  if (!setCookie) return;
  const pairs = parseSetCookieHeader(setCookie);
  setCookies(mergeCookiePairs(getCookies(), pairs));
}
