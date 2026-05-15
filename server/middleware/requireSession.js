// Gate routes that need an established av-avon session. Returns 401 when
// the in-memory session is empty (typically because the server restarted
// since the browser logged in). The client (public/js/shared/api.js)
// detects 401 and bounces to /login.html?session_expired=true.

import { hasActiveSession } from "../services/av.js";
import { ApiError } from "./errorHandler.js";

// Paths that do NOT require an established session: the login endpoint
// itself, the credentials helper, the Adyen client-config endpoint (it
// has its own fallback for the pre-login state), and the test-only
// proxy relay.
const EXEMPT_PATHS = new Set([
  "/login",
  "/auth/defaults",
  "/getPaymentClientConfig",
  "/proxy",
]);

export function requireSession(req, res, next) {
  if (EXEMPT_PATHS.has(req.path)) return next();
  if (hasActiveSession()) return next();
  next(new ApiError(401, "Not authenticated", { code: "SESSION_EXPIRED" }));
}
