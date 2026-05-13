// server/routes/login.js — authentication + initial customer load.
//
// Composes three auth services (authenticate → loadSessionCustomerId →
// loadMyCustomer); each records its apiCallMetadata into the per-request
// AsyncLocalStorage trail so the UI debug console can replay the chain.

import express from "express";
import { setSession } from "../utils/sessionStore.js";
import { isDebugMode } from "../utils/debug.js";
import { handler } from "../middleware/handler.js";
import { authenticate } from "../services/auth/authenticate.js";
import { loadSessionCustomerId } from "../services/auth/loadSessionCustomerId.js";
import { loadMyCustomer } from "../services/auth/loadMyCustomer.js";

const router = express.Router();

/** GET /auth/defaults — pre-fill the login form from .env. */
const authDefaults = handler({
  async run() {
    return {
      apiBase: process.env.API_BASE || "",
      username: process.env.UNL_USER || "",
      password: process.env.UNL_PASSWORD || "",
    };
  },
});

const postLogin = handler({
  async run(input, { req }) {
    const apiBase = req.body?.apiBase || process.env.API_BASE;
    const username = req.body?.username || process.env.UNL_USER;
    const password = req.body?.password || process.env.UNL_PASSWORD;

    const auth = await authenticate({ apiBase, username, password });
    setSession(auth.session, auth.cookies, apiBase);

    const user = await loadSessionCustomerId({ apiBase, cookies: auth.cookies });
    const customer = await loadMyCustomer({
      apiBase,
      cookies: auth.cookies,
      customerId: user.customerId,
    });

    if (isDebugMode()) {
      console.log("Login successful, customer_id:", user.customerId, ", API base:", apiBase);
    }
    return {
      session: auth.session,
      version: auth.version,
      customerId: user.customerId,
      customerData: customer.customerData,
    };
  },
});

router.get( "/auth/defaults", authDefaults);
// /login needs express.json() since postLogin has no body schema.
router.post("/login",         express.json(), postLogin);

export default router;
