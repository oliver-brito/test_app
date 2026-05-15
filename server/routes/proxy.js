// server/routes/proxy.js
//
// Test-only escape hatch: forwards an arbitrary request to av-avon (or an
// absolute external URL) with the active Session + Cookie injected. Used
// by the API debug console in the UI; not part of the supported API
// surface — DO NOT expose outside dev.

import express from "express";
import { authHeaders } from "../utils/authHeaders.js";
import { getApiBase } from "../utils/sessionStore.js";
import { env } from "../config/env.js";
import { handler } from "../middleware/handler.js";

const router = express.Router();

const proxy = handler({
  async run({ method = "GET", path: reqPath = "/", headers = {}, body }) {
    const url = /^https?:\/\//i.test(reqPath)
      ? reqPath
      : new URL(reqPath, getApiBase() || env.API_BASE).toString();

    // Browser can't inject Session/Cookie — strip any forgery attempt and
    // let authHeaders() provide them.
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

    return {
      request: { url, method, headers: authHeaders(sanitized), body: body ?? null },
      response: {
        status: out.status,
        statusText: out.statusText,
        headers: Object.fromEntries(out.headers.entries()),
        data,
      },
    };
  },
});

// /proxy has no body schema (free-form), so we mount express.json() inline.
router.post("/proxy", express.json(), proxy);

export default router;
