// endpoints/routes/details.js
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { isDebugMode } from "../utils/debug.js";
import { fileURLToPath } from "url";
import { CURRENT_SESSION } from "../utils/sessionStore.js";
import { getCookies, setCookies } from "../utils/sessionStore.js";
import { authHeaders } from "../utils/authHeaders.js";
import { parseSetCookieHeader, mergeCookiePairs } from "../utils/cookieUtils.js";
import { ENDPOINTS } from "../../public/endpoints.js";

// Setup environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const { API_BASE } = process.env;
const { ORDER: ORDER_PATH } = ENDPOINTS;

const router = express.Router();

// GET /order -> Retrieve order details from AudienceView
router.get("/order", async (req, res) => {
  try {
    if (isDebugMode()) console.log('Starting /order route');
    
    if (!CURRENT_SESSION) return res.status(401).json({ error: "Not authenticated" });
    if (!ORDER_PATH) return res.status(500).json({ error: "ORDER_PATH not configured" });

    const url = new URL(ORDER_PATH, API_BASE).toString();
    
    const payload = {
      get: ["Order", "Admissions"],
      objectName: "myOrder"
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      const pairs = parseSetCookieHeader(setCookie);
      setCookies(mergeCookiePairs(getCookies(), pairs));
    }

    const responseText = await response.text();

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = responseText;
    }

    if (!response.ok) {
      if (isDebugMode()) console.log('Order details fetch failed:', response.status);
      return res.status(response.status).json({
        error: "Failed to fetch order details",
        details: responseData
      });
    }

    // Extract order information from response
    const orderData = responseData?.data?.Order || {};
    
    if (isDebugMode()) console.log('Order details fetched successfully');

    res.json({
      success: true,
      order: orderData,
      rawResponse: responseData,
      admissions: responseData?.data?.Admissions || {}
    });

  } catch (err) {
    if (isDebugMode()) console.log("Error in /order:", err.message);
    res.status(500).json({ 
      error: String(err?.message || err) 
    });
  }
});

// GET /details -> Retrieve payment details from AudienceView
router.get("/details", async (req, res) => {
  try {
    if (isDebugMode()) console.log('Starting /details route');
    
    if (!CURRENT_SESSION) return res.status(401).json({ error: "Not authenticated" });
    if (!ORDER_PATH) return res.status(500).json({ error: "ORDER_PATH not configured" });
    const url = new URL(ORDER_PATH, API_BASE).toString();

    const payload = {
      get: ["Payments"],
      objectName: "myOrder"
    };
    const r = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const raw = await r.text();
    let data;
    try { data = JSON.parse(raw); } catch { 
      // Always return JSON, even if parsing fails
      if (isDebugMode()) console.log("Payment details fetch failed: Invalid JSON");
      return res.status(500).json({ error: "Invalid JSON from upstream", raw });
    }
    if (!r.ok) {
      if (isDebugMode()) console.log('Payment details fetch failed:', r.status);
      return res.status(r.status).json({ error: "Failed to fetch payment details", details: data });
    }

    if (isDebugMode()) console.log('Payment details fetched successfully');
    res.json({
      success: true,
      payments: data?.data?.Payments || {},
      rawResponse: data
    });

  } catch (err) {
    if (isDebugMode()) console.log("Error in /details:", err.message);
    res.status(500).json({
      error: String(err?.message || err)
    });
  }
});

export default router;
