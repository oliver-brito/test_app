// endpoints/routes/login.js
import express from "express";
import { setSession } from "../utils/sessionStore.js";
import { filterCookieHeader } from "../utils/cookieUtils.js";
import { isDebugMode } from "../utils/debug.js";
import { ENDPOINTS } from "../../public/js/endpoints.js";
import { parseResponse } from "../utils/common.js";
import { wrapRoute } from "../utils/routeWrapper.js";

const router = express.Router();

/**
 * GET /auth/defaults
 * Returns default credentials from .env for pre-filling login form
 */
router.get("/auth/defaults", (req, res) => {
  res.json({
    apiBase: process.env.API_BASE || '',
    username: process.env.UNL_USER || '',
    password: process.env.UNL_PASSWORD || ''
  });
});

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

  // Save globally including the API base URL from the user's input
  setSession(session, cookies, apiBase);

  // Validate that user has a customer_id assigned
  const userUrl = new URL('/app/WebAPI/v2/user', apiBase).toString();
  const userBody = {
    session: {
      get: ["customer_id"]
    }
  };

  const userStartTime = Date.now();
  const userResponse = await fetch(userUrl, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Cookie: cookies
    },
    body: JSON.stringify(userBody)
  });

  const userDuration = Date.now() - userStartTime;
  const userData = await parseResponse(userResponse);

  // Create API call metadata for user validation
  const userApiCallMetadata = {
    method: 'POST',
    endpoint: userUrl,
    status: userResponse.status,
    request: {
      method: 'POST',
      endpoint: userUrl,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        Cookie: cookies
      },
      body: userBody,
      timestamp: new Date().toISOString()
    },
    response: userData,
    duration: userDuration
  };

  // Check if customer_id is empty or missing
  const customerIdObj = userData?.data?.customer_id;
  const customerId = customerIdObj?.standard?.trim() || '';

  if (!customerId) {
    if (isDebugMode()) console.log("Login failed: No customer assigned to user. Customer ID object:", customerIdObj);
    return res.status(400).json({
      error: "Please log in with a user that has a customer assigned to it",
      details: "No customer_id found for this user",
      endpoint: userUrl,
      status: 400,
      request: userApiCallMetadata.request,
      response: userData,
      backendApiCalls: [apiCallMetadata, userApiCallMetadata]
    });
  }

  if (isDebugMode()) console.log("Login successful, customer_id:", customerId, ", API base:", apiBase);
  res.json({
    session: data.session,
    version: data.version,
    customerId: customerId,
    backendApiCalls: [apiCallMetadata, userApiCallMetadata]
  });
}));

export default router;
