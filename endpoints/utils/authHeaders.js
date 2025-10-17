import { CURRENT_SESSION, CURRENT_COOKIES } from "../utils/sessionStore.js";
import { filterCookieHeader } from "./cookieUtils.js";

export function authHeaders(extra = {}) {
  const base = {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
  };
  if (CURRENT_SESSION) base.Session = CURRENT_SESSION;
  if (CURRENT_COOKIES) base.Cookie = filterCookieHeader(CURRENT_COOKIES);
  return { ...base, ...extra };
}
