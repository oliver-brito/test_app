// endpoints/routes/login.js (refactored to use common helpers)
import express from "express";
import { setSession } from "../utils/sessionStore.js";
import { printDebugMessage } from "../utils/debug.js";
import { ENDPOINTS } from "../../public/endpoints.js";
import { sendCall, handleSetCookies } from "../utils/common.js"; // note: no validateCall (pre-auth)

const router = express.Router();

/**
 * POST /login
 * Authenticates the user with AudienceView API and stores session + cookies.
 */
router.post("/login", async (_req, res) => {
  try {
    printDebugMessage("Starting /login route");
    const payload = { userid: process.env.UNL_USER, password: process.env.UNL_PASSWORD };
    const response = await sendCall(ENDPOINTS.AUTH, payload);
    await handleSetCookies(response); // merges any set-cookie (session)
    const raw = await response.text();
    let data; try { data = JSON.parse(raw); } catch { data = raw; }
    if (!response.ok || !data?.session) {
      printDebugMessage(`Login authentication failed: ${response.status}`);
      return res.status(response.status || 500).json({ error: "Auth failed", details: data });
    }
    // Persist session + current cookies (handleSetCookies already merged them into store)
    setSession(data.session);
    printDebugMessage("Login successful");
    res.json({ session: data.session, version: data.version });
  } catch (err) {
    printDebugMessage(`Error in /login: ${err.message}`);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

export default router;
