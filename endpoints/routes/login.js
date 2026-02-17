// endpoints/routes/login.js
import express from "express";
import { setSession } from "../utils/sessionStore.js";
import { filterCookieHeader } from "../utils/cookieUtils.js";
import { isDebugMode } from "../utils/debug.js";
import { ENDPOINTS } from "../../public/endpoints.js";
import { parseResponse } from "../utils/common.js";
import { wrapRoute } from "../utils/routeWrapper.js";

const router = express.Router();

/**
 * POST /login
 * Authenticates the user with AudienceView API and stores session + cookies.
 * Accepts optional credentials from request body, falls back to .env if not provided.
 * Note: Cannot use makeApiCall since this endpoint establishes the session.
 */
router.post("/login", wrapRoute(async (req, res) => {
  if (isDebugMode()) console.log("Starting /login route");

  // Accept credentials from request body or fall back to .env
  const apiBase = req.body?.apiBase || process.env.API_BASE;
  const username = req.body?.username || process.env.UNL_USER;
  const password = req.body?.password || process.env.UNL_PASSWORD;
  const customerNumber = req.body?.customerNumber || process.env.CUSTOMER_NUMBER || '1';

  const url = new URL(ENDPOINTS.AUTH, apiBase).toString();
  const body = { userid: username, password: password };

  const startTime = Date.now();

  const r = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body),
  });

  const duration = Date.now() - startTime;

  const data = await parseResponse(r);

  // Create API call metadata for debug console
  const apiCallMetadata = {
    method: 'POST',
    endpoint: url,
    status: r.status,
    request: {
      method: 'POST',
      endpoint: url,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: body,
      timestamp: new Date().toISOString()
    },
    response: data,
    duration: duration
  };

  if (!r.ok || !data?.session) {
    if (isDebugMode()) console.log("Login authentication failed:", r.status);
    return res.status(r.status || 500).json({
      error: "Auth failed",
      details: data,
      endpoint: url,
      status: r.status,
      request: apiCallMetadata.request,
      response: data,
      backendApiCalls: [apiCallMetadata]
    });
  }

  const session = data.session;
  const setCookie = r.headers.get("set-cookie");
  const cookies = setCookie ? filterCookieHeader(setCookie) : `session=${session}`;

  // Save globally
  setSession(session, cookies);

  if (isDebugMode()) console.log("Login successful");
  res.json({
    session: data.session,
    version: data.version,
    customerNumber: customerNumber,
    backendApiCalls: [apiCallMetadata]
  });
}));

export default router;
