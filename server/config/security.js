import helmet from "helmet";

const ALLOWED = [
  "https://*.adyen.com",
  "https://*.google.com",
  "https://*.apple.com",
  "https://*.cardinalcommerce.com",
];

export const securityMiddleware = helmet({
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      "default-src": ["'self'"],
      "script-src": ["'self'", "'unsafe-inline'", ...ALLOWED],
      "style-src": ["'self'", "'unsafe-inline'", ...ALLOWED],
      "img-src": ["'self'", "data:", ...ALLOWED],
      "font-src": ["'self'", "data:", ...ALLOWED],
      "connect-src": ["'self'", ...ALLOWED],
      "frame-src": ["'self'", ...ALLOWED],
      "frame-ancestors": ["'self'", ...ALLOWED],
      "child-src": ["'self'", ...ALLOWED],
    },
  },
  crossOriginEmbedderPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
});
