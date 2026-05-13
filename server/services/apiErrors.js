import { EXCEPTION_CODES } from "../constants.js";

/**
 * Classify an av-avon error response so callers can decide whether to
 * surface a 3DS challenge, treat the request as user-cancelled, or
 * fall through to a generic error response.
 *
 * @param {any} data Parsed JSON response (or raw text) from av-avon.
 * @returns {"threeDS" | "cancelled" | "other"}
 */
export function classifyException(data) {
  const code = data?.exception?.number;
  if (code === EXCEPTION_CODES.THREE_DS_REQUIRED) return "threeDS";
  if (code === EXCEPTION_CODES.PAYMENT_CANCELLED) return "cancelled";

  // Fall back to substring match for cases where the body isn't parsed JSON
  // (older av-avon paths return text). Mirrors prior behavior.
  try {
    const source = typeof data === "string" ? data : JSON.stringify(data ?? "");
    if (source.includes(String(EXCEPTION_CODES.THREE_DS_REQUIRED))) return "threeDS";
  } catch {
    // ignore — return 'other'
  }
  return "other";
}
