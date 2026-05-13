// server/routes/login.js — authentication + initial customer load.
//
// The route is a thin adapter: it reads credentials, composes the three
// auth services (authenticate → loadSessionCustomerId → loadMyCustomer),
// saves the session, and returns the login payload to the UI. Each step's
// apiCallMetadata is collected so the debug console can replay the chain.

import express from "express";
import { setSession } from "../utils/sessionStore.js";
import { isDebugMode } from "../utils/debug.js";
import { authenticate } from "../services/auth/authenticate.js";
import { loadSessionCustomerId } from "../services/auth/loadSessionCustomerId.js";
import { loadMyCustomer } from "../services/auth/loadMyCustomer.js";

const router = express.Router();

/** GET /auth/defaults — pre-fill the login form from .env. */
router.get("/auth/defaults", (req, res) => {
  res.json({
    apiBase: process.env.API_BASE || "",
    username: process.env.UNL_USER || "",
    password: process.env.UNL_PASSWORD || "",
  });
});

router.post("/login", express.json(), async (req, res) => {
  if (isDebugMode()) console.log("Starting /login route");

  const apiBase = req.body?.apiBase || process.env.API_BASE;
  const username = req.body?.username || process.env.UNL_USER;
  const password = req.body?.password || process.env.UNL_PASSWORD;

  const auth = await authenticate({ apiBase, username, password });
  setSession(auth.session, auth.cookies, apiBase);

  let user, customer;
  try {
    user = await loadSessionCustomerId({ apiBase, cookies: auth.cookies });
  } catch (err) {
    // Augment with the auth-step trail so the UI can show what happened.
    err.backendApiCalls = [auth.apiCallMetadata, err.apiCallMetadata].filter(Boolean);
    throw err;
  }

  customer = await loadMyCustomer({ apiBase, cookies: auth.cookies, customerId: user.customerId });

  if (isDebugMode()) {
    console.log("Login successful, customer_id:", user.customerId, ", API base:", apiBase);
  }
  res.json({
    session: auth.session,
    version: auth.version,
    customerId: user.customerId,
    customerData: customer.customerData,
    backendApiCalls: [auth.apiCallMetadata, user.apiCallMetadata, customer.apiCallMetadata],
  });
});

export default router;
