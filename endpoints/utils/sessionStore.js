// endpoints/utils/sessionStore.js

// Global session, cookies, and API base store
let CURRENT_SESSION = null;
let CURRENT_COOKIES = "";
let CURRENT_API_BASE = null;

/**
 * Returns the current session value.
 */
export function getSession() {
  return CURRENT_SESSION;
}

/**
 * Returns the current cookies string.
 */
export function getCookies() {
  return CURRENT_COOKIES;
}

/**
 * Returns the current API base URL.
 */
export function getApiBase() {
  return CURRENT_API_BASE;
}

/**
 * Updates session, cookies, and optionally API base URL.
 */
export function setSession(session, cookies = "", apiBase = null) {
  CURRENT_SESSION = session;
  CURRENT_COOKIES = cookies;
  if (apiBase) {
    CURRENT_API_BASE = apiBase;
  }
}

/**
 * Updates only the cookies.
 */
export function setCookies(cookies) {
  CURRENT_COOKIES = cookies;
}

/**
 * Updates only the API base URL.
 */
export function setApiBase(apiBase) {
  CURRENT_API_BASE = apiBase;
}

/**
 * Clears the current session, cookies, and API base.
 */
export function clearSession() {
  CURRENT_SESSION = null;
  CURRENT_COOKIES = "";
  CURRENT_API_BASE = null;
}

// Export the variables directly for compatibility with existing code
export { CURRENT_SESSION, CURRENT_COOKIES, CURRENT_API_BASE };
