// public/endpoints.js
// Non-sensitive, static API endpoint path fragments committed to source control.
// Exposed to both server (import) and client (served statically) – contains no secrets.
export const ENDPOINTS = {
  AUTH: "/app/WebAPI/v2/session/authenticateUser",
  UPCOMING: "/app/WebAPI/v2/content",
  MAP: "/app/WebAPI/v2/map",
  PERFORMANCE: "/app/WebAPI/v2/performance",
  ORDER: "/app/WebAPI/v2/order",
  CUSTOMER: "/app/WebAPI/v2/customer",
  SESSION: "/app/WebAPI/session",
  PAYMENT_METHOD: "/app/WebAPI/v2/paymentmethod",
  USER: "/app/WebAPI/v2/user"
};

// Optional helper for building full URLs server-side
export const buildApiUrl = (base, path) => new URL(path, base).toString();
