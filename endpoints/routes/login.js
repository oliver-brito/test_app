// endpoints/routes/login.js
import express from "express";
import { setSession } from "../utils/sessionStore.js";
import { filterCookieHeader } from "../utils/cookieUtils.js";

const router = express.Router();

/**
 * POST /login
 * Authenticates the user with AudienceView API and stores session + cookies.
 */
router.post("/login", async (_req, res) => {
    console.log("Received /login request");
  try {
    const url = new URL(process.env.AUTH_PATH, process.env.API_BASE).toString();
    const body = { userid: process.env.UNL_USER, password: process.env.UNL_PASSWORD };
    console.log("Authenticating with AudienceView API at:", url, "for user:", body);
    const r = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body),
    });

    const raw = await r.text();
    let data;
    try { data = JSON.parse(raw); } 
    catch { data = raw; }

    if (!r.ok || !data?.session) {
      return res.status(r.status || 500).json({ error: "Auth failed", details: data });
    }

    const session = data.session;
    const setCookie = r.headers.get("set-cookie");
    const cookies = setCookie ? filterCookieHeader(setCookie) : `session=${session}`;

    // Save globally
    setSession(session, cookies);

    res.json({ session: data.session, version: data.version });
  } catch (err) {
    console.error("Error in /login:", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

export default router;
