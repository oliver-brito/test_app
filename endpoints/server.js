// endpoints/server.js
import express from "express";
import dotenv from "dotenv";
import fs from "fs";
import https from "https";
import path from "path";
import { fileURLToPath } from "url";
import { authHeaders } from "./utils/authHeaders.js";
import { ENDPOINTS } from "../public/endpoints.js"; // Non-sensitive static paths

import loginRouter from "./routes/login.js";
import eventsRouter from "./routes/events.js";
import detailsRouter from "./routes/details.js";
import paymentsRouter from "./routes/payments.js";
import seatsRouter from "./routes/seats.js";
import threeDSRouter from "./routes/3ds.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../.env") });

// Initialize Express
const app = express();
app.use(express.json({ limit: "1mb" }));

// Serve static files from /public
app.use(express.static(path.join(__dirname, "../public")));

/**
 * Global security headers and CSP policy.
 * Allows Adyen, Google, and Apple resources.
 */
app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self';",
      "script-src 'self' 'unsafe-inline' https://*.adyen.com https://*.google.com https://*.apple.com;",
      "style-src 'self' 'unsafe-inline' https://*.adyen.com https://*.google.com https://*.apple.com;",
      "img-src 'self' data: https://*.adyen.com https://*.google.com https://*.apple.com;",
      "font-src 'self' data: https://*.adyen.com https://*.google.com https://*.apple.com;",
      "connect-src 'self' https://*.adyen.com https://*.google.com https://*.apple.com;",
      "frame-src 'self' https://*.adyen.com https://*.google.com https://*.apple.com;",
      "frame-ancestors 'self' https://*.adyen.com https://*.google.com https://*.apple.com;",
      "child-src 'self' https://*.adyen.com https://*.google.com https://*.apple.com;"
    ].join(" ")
  );

  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});


// --- Environment variables from .env
const { API_BASE, UNL_USER, UNL_PASSWORD } = process.env;
// Map endpoint constants from public config for server-side convenience
const {
  AUTH: AUTH_PATH,
  UPCOMING: UPCOMING_PATH,
} = ENDPOINTS;

// --- Basic environment validation
if (!API_BASE || !AUTH_PATH || !UNL_USER || !UNL_PASSWORD) {
  console.error("Missing API_BASE, AUTH_PATH, UNL_USER, or UNL_PASSWORD in environment (.env)");
  process.exit(1);
}

if (!UPCOMING_PATH) {
  console.warn("UPCOMING_PATH not defined in endpoints.js (needed for /events/upcoming)");
}

// Mount routes — keeps endpoint as /login
app.use("/", loginRouter);
app.use("/", eventsRouter);
app.use("/", detailsRouter);
app.use("/", paymentsRouter);
app.use("/", seatsRouter);
app.use("/", threeDSRouter);

// Generic proxy that auto-injects Session + Cookie
app.post("/proxy", async (req, res) => {
  try {
    const { method = "GET", path = "/", headers = {}, body } = req.body || {};
    const url = new URL(path, API_BASE).toString();

    const sanitized = { ...headers };
    // Browser may not override our auth
    delete sanitized.Session;
    delete sanitized.session;
    delete sanitized.Cookie;
    delete sanitized.cookie;

    const out = await fetch(url, {
      method,
      headers: { ...authHeaders(), ...sanitized }, // <-- includes Cookie
      body: ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())
        ? (typeof body === "string" ? body : JSON.stringify(body ?? {}))
        : undefined,
    });

    const text = await out.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }

    res.status(200).json({
      request: {
        url,
        method,
        headers: authHeaders(sanitized),
        body: body ?? null
      },
      response: {
        status: out.status,
        statusText: out.statusText,
        headers: Object.fromEntries(out.headers.entries()),
        data
      }
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});


// --- HTTP + HTTPS ---
const httpPort  = process.env.PORT || 3000;
const httpsPort = process.env.HTTPS_PORT || 3443;
const httpsKey  = process.env.HTTPS_KEY;
const httpsCert = process.env.HTTPS_CERT;

if (httpsKey && httpsCert && fs.existsSync(httpsKey) && fs.existsSync(httpsCert)) {
  // Start HTTPS only
  const credentials = {
    key:  fs.readFileSync(httpsKey),
    cert: fs.readFileSync(httpsCert),
  };
  https.createServer(credentials, app).listen(httpsPort, () => {
    console.log(`HTTPS listening at https://localhost:${httpsPort}`);
  });
} else {
  // Start HTTP only
  app.listen(httpPort, () => {
    console.log(`HTTP listening at http://localhost:${httpPort}`);
  });
}
