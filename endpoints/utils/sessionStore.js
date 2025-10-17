// endpoints/utils/sessionStore.js

// Global session and cookies store
let CURRENT_SESSION = null;
let CURRENT_COOKIES = "";

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
 * Updates both session and cookies.
 */
export function setSession(session, cookies = "") {
  CURRENT_SESSION = session;
  CURRENT_COOKIES = cookies;
}

/**
 * Updates only the cookies.
 */
export function setCookies(cookies) {
  CURRENT_COOKIES = cookies;
}

/**
 * Clears the current session and cookies.
 */
export function clearSession() {
  CURRENT_SESSION = null;
  CURRENT_COOKIES = "";
}

// Export the variables directly for compatibility with existing code
export { CURRENT_SESSION, CURRENT_COOKIES };
