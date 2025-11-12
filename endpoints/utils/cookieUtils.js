// endpoints/utils/cookieUtils.js

import { getCookies, setCookies } from "../utils/sessionStore.js";

/**
 * Filters a raw Set-Cookie header string to keep only "name=value" pairs.
 */
export function filterCookieHeader(cookieStr) {
  if (!cookieStr) return "";
  const parts = cookieStr.split(/,(?=\s*[^;=]+=[^;]+)/g);
  return parts
    .map(p => p.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

/**
 * Parses a Set-Cookie header and returns an array of "name=value" pairs.
 */
export function parseSetCookieHeader(setCookieStr) {
  if (!setCookieStr) return [];
  const parts = setCookieStr.split(/,(?=\s*[^;=]+=[^;]+)/g);
  return parts.map(p => p.split(";")[0].trim()).filter(Boolean);
}

/**
 * Merges two cookie header strings, avoiding duplicates.
 */
export function mergeCookiePairs(existingHeader, newPairs) {
  const jar = new Map();
  (existingHeader ? existingHeader.split(";").map(s => s.trim()) : [])
    .filter(Boolean)
    .forEach(kv => {
      const [k, ...rest] = kv.split("=");
      jar.set(k, rest.join("="));
    });

  newPairs.forEach(kv => {
    const [k, ...rest] = kv.split("=");
    jar.set(k, rest.join("="));
  });

  return Array.from(jar.entries())
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}
