// Single owner of the cross-page checkout state. Backed by sessionStorage
// (auto-cleared on tab close) rather than localStorage, so an abandoned
// checkout doesn't leak into a future session.
//
// `eventId` is also passed via URL query (`checkout.html?eventId=01`) so
// the URL is shareable and the user can see what they're checking out.

const KEY = "checkoutContext";

/**
 * @typedef {Object} CheckoutContext
 * @property {string} [eventId]
 * @property {string} [eventName]
 * @property {string} [eventDate]
 * @property {string} [deliveryMethod]
 * @property {string} [paymentMethod]
 * @property {string} [paymentId]
 */

/** @returns {CheckoutContext} */
export function getContext() {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Merge-and-save. @param {CheckoutContext} updates */
export function setContext(updates) {
  const merged = { ...getContext(), ...updates };
  sessionStorage.setItem(KEY, JSON.stringify(merged));
  return merged;
}

export function clearContext() {
  sessionStorage.removeItem(KEY);
}

/**
 * Resolve the active eventId: URL query param wins (so the URL is
 * authoritative + shareable); falls back to sessionStorage if absent.
 */
export function getEventId() {
  const fromUrl = new URLSearchParams(window.location.search).get("eventId");
  if (fromUrl) return fromUrl;
  return getContext().eventId || "";
}
