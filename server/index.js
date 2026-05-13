// server/index.js
import express from "express";
import https from "https";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";

import { env } from "./config/env.js";
import { securityMiddleware } from "./config/security.js";
import { loadCredentials } from "./config/https.js";
import { authHeaders } from "./utils/authHeaders.js";
import { getApiBase } from "./utils/sessionStore.js";

import loginRouter from "./routes/login.js";
import eventsRouter from "./routes/events.js";
import detailsRouter from "./routes/details.js";
import paymentsRouter from "./routes/payments.js";
import adyenRouter from "./routes/adyen.js";
import seatsRouter from "./routes/seats.js";
import threeDSRouter from "./routes/threeDS.js";
import customerRouter from "./routes/customer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

app.use(morgan("dev"));
app.use(securityMiddleware);
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "../public")));

app.use("/", loginRouter);
app.use("/", eventsRouter);
app.use("/", detailsRouter);
app.use("/", paymentsRouter);
app.use("/", adyenRouter);
app.use("/", seatsRouter);
app.use("/", threeDSRouter);
app.use("/", customerRouter);

// Generic proxy that auto-injects Session + Cookie.
// Test-only escape hatch — will be moved to routes/proxy.js in a follow-up commit.
app.post("/proxy", async (req, res) => {
  try {
    const { method = "GET", path: reqPath = "/", headers = {}, body } = req.body || {};
    const url = /^https?:\/\//i.test(reqPath)
      ? reqPath
      : new URL(reqPath, getApiBase() || env.API_BASE).toString();

    const sanitized = { ...headers };
    delete sanitized.Session;
    delete sanitized.session;
    delete sanitized.Cookie;
    delete sanitized.cookie;

    const out = await fetch(url, {
      method,
      headers: { ...authHeaders(), ...sanitized },
      body: ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())
        ? typeof body === "string"
          ? body
          : JSON.stringify(body ?? {})
        : undefined,
    });

    const text = await out.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    res.status(200).json({
      request: { url, method, headers: authHeaders(sanitized), body: body ?? null },
      response: {
        status: out.status,
        statusText: out.statusText,
        headers: Object.fromEntries(out.headers.entries()),
        data,
      },
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

const credentials = await loadCredentials();
if (credentials) {
  https.createServer(credentials, app).listen(env.httpsPort, () => {
    console.log(`HTTPS listening at https://localhost:${env.httpsPort} (certs auto-detected)`);
  });
} else {
  app.listen(env.httpPort, () => {
    console.log(`HTTP listening at http://localhost:${env.httpPort} (no certs detected)`);
  });
}
