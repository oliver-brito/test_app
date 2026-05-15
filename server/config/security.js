import helmet from "helmet";

// Origins our pages legitimately load resources from:
//   *.adyen.com           — Adyen Drop-in SDK + iframes
//   *.google.com          — Adyen pay-button fallbacks
//   *.apple.com           — Apple Pay
//   *.cardinalcommerce.com — Cardinal Cruise (3DS challenge iframe)
//   *.cardinaltrusted.com  — Cardinal Cruise Collect endpoint (cas.client.cardinaltrusted.com)
//   *.audienceview.com     — UPS hosted-fields SDK + payment form iframe
const ALLOWED = [
  "https://*.adyen.com",
  "https://*.google.com",
  "https://*.apple.com",
  "https://*.cardinalcommerce.com",
  "https://*.cardinaltrusted.com",
  "https://*.audienceview.com",
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
