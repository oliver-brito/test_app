// endpoints/routes/details.js
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { CURRENT_SESSION } from "../utils/sessionStore.js";
import { getCookies, setCookies } from "../utils/sessionStore.js";
import { authHeaders } from "../utils/authHeaders.js";
import { parseSetCookieHeader, mergeCookiePairs } from "../utils/cookieUtils.js";

// Setup environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const { API_BASE, ORDER_PATH } = process.env;

const router = express.Router();

// GET /order -> Retrieve order details from AudienceView
router.get("/order", async (req, res) => {
  try {
    if (!CURRENT_SESSION) return res.status(401).json({ error: "Not authenticated" });
    if (!ORDER_PATH) return res.status(500).json({ error: "ORDER_PATH not configured" });

    const url = new URL(ORDER_PATH, API_BASE).toString();
    
    const payload = {
      get: ["Order", "Admissions"],
      objectName: "myOrder"
    };

    console.log('Fetching order details with payload:', payload);

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
    console.log('Order details response status:', response.status);
    console.log('Order details response text:', responseText);

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = responseText;
    }

    if (!response.ok) {
      console.error('AudienceView API error:', responseData);
      return res.status(response.status).json({
        error: "Failed to fetch order details",
        details: responseData
      });
    }

    // Extract order information from response
    const orderData = responseData?.data?.Order || {};
    
    console.log('Order details fetched successfully:', orderData);

    res.json({
      success: true,
      order: orderData,
      rawResponse: responseData,
      admissions: responseData?.data?.Admissions || {}
    });

  } catch (err) {
    console.error("Error in /order:", err);
    res.status(500).json({ 
      error: String(err?.message || err) 
    });
  }
});

// GET /details -> Retrieve payment details from AudienceView
router.get("/details", async (req, res) => {
  try {
    if (!CURRENT_SESSION) return res.status(401).json({ error: "Not authenticated" });
    if (!ORDER_PATH) return res.status(500).json({ error: "ORDER_PATH not configured" });
    const url = new URL(ORDER_PATH, API_BASE).toString();

    const payload = {
      get: ["Payments"],
      objectName: "myOrder"
    };

    console.log('Fetching payment details with payload:', payload);
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
      return res.status(500).json({ error: "Invalid JSON from upstream", raw });
    }
    if (!r.ok) {
      return res.status(r.status).json({ error: "Failed to fetch payment details", details: data });
    }

    res.json({
      success: true,
      payments: data?.data?.Payments || {},
      rawResponse: data
    });
    console.log(raw);

  } catch (err) {
    console.error("Error in /details:", err);
    res.status(500).json({
      error: String(err?.message || err)
    });
  }
});

export default router;
