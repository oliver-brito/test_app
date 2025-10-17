// endpoints/routes/events.js
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { CURRENT_SESSION } from "../utils/sessionStore.js";
import { filterCookieHeader, parseSetCookieHeader, mergeCookiePairs } from "../utils/cookieUtils.js";
import { getCookies, setCookies } from "../utils/sessionStore.js";
import { authHeaders } from "../utils/authHeaders.js";

// Setup environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const { API_BASE, UPCOMING_PATH, ORDER_PATH, PERFORMANCE_PATH, MAP_PATH } = process.env;

const router = express.Router();


// GET /events/upcoming -> calls process.env.UPCOMING_PATH with Session + Cookie
router.get("/events/upcoming", async (_req, res) => {
  console.log("Received /events/upcoming request");
  try {
    if (!CURRENT_SESSION) {
      console.log("No current session found: ", CURRENT_SESSION);
      return res.status(401).json({ error: "Not authenticated" });
    }
    if (!process.env.UPCOMING_PATH){
      console.log("No UPCOMING_PATH configured: ", process.env.UPCOMING_PATH);
      return res.status(500).json({ error: "UPCOMING_PATH not configured" });
    }

    const url = new URL(process.env.UPCOMING_PATH, process.env.API_BASE).toString();
    const movePage = parseInt(_req.query.movePage);
    const method = movePage == 1 ? "nextPage" : movePage == -1 ? "prevPage" : "search";
    const payload = {
      actions: [{ method: method }],
      set: {
        "SearchCriteria::object_type_filter": "P",
        "SearchCriteria::search_criteria": "",
        "SearchCriteria::search_from": "",
        "SearchCriteria::search_to": ""
      },
      get: [
        "SearchResultsInfo::total_records",
        "SearchResultsInfo::current_page",
        "SearchResultsInfo::total_pages",
        "SearchResults"
      ],
      objectName: "mySearchResults"
    };
    // ✅ correct headers: text/plain wins, plus Session + Cookie
    const requestOptions = {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    };

    console.log("Calling Upcoming API at:", url, "with payload:", payload);
    const r = await fetch(url, requestOptions);

    // 🥐 capture & merge any cookies the endpoint sets (Cloudflare, etc.)
    const setCookie = r.headers.get("set-cookie");
    if (setCookie) {
      const pairs = parseSetCookieHeader(setCookie);
      // Merge, then filter to name=value pairs only
      setCookies(filterCookieHeader(mergeCookiePairs(getCookies(), pairs)));
    }

    const rawText = await r.text();
    let data; try { data = JSON.parse(rawText); } catch { data = rawText; }

    if (!r.ok) {
      console.error("[UPCOMING] status", r.status, r.statusText);
      console.error("[UPCOMING] body", data);
      return res.status(r.status).json({ error: "Upcoming failed", details: data });
    }

    // Some AV stacks return 200 with an error payload—guard that:
    if (data?.errorCode || /error/i.test(data?.message || "")) {
      console.error("[UPCOMING] soft error", data);
      return res.status(400).json({ error: "Upstream error", details: data });
    }

    const resultsObj = data?.data?.SearchResults || {};
    const events = Object.values(resultsObj);
    res.json({ events });
  } catch (err) {
    console.error("Error in /events/upcoming:", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// POST /map/availability/:performanceId  -> calls AV map.loadAvailability
router.post("/map/availability/:id", async (req, res) => {
  try {
    if (!CURRENT_SESSION) return res.status(401).json({ error: "Not authenticated" });
    if (!ORDER_PATH) return res.status(500).json({ error: "ORDER_PATH not configured" });

    const performanceId = req.params.id;
    const priceTypeId = req.body?.priceTypeId;
    const numSeats = req.body?.numSeats;

    const url = new URL(ORDER_PATH, API_BASE).toString();
    const payload = {
      actions: [
        {
          method: "getBestAvailable",
          params: {
            perfVector: [performanceId],
            reqRows: "1",
            [`reqNum::${priceTypeId}`]: String(numSeats),
            optNum: "2"
          }
        }
      ],
      get: ["Admissions", "AvailablePaymentMethods", "DeliveryMethodDetails"],
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

    const setCookie = r.headers.get("set-cookie");
    if (setCookie) {
      const pairs = parseSetCookieHeader(setCookie);
      setCookies(mergeCookiePairs(getCookies(), pairs));
    }

    const raw = await r.text();
    let data; try { data = JSON.parse(raw); } catch { data = raw; }

    if (!r.ok) {
      return res.status(r.status).json({ error: "getBestAvailable failed", details: data });
    }

    res.json(data);
  } catch (err) {
    console.error("Error in /map/availability:", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// GET /events/:id -> calls PERFORMANCE_PATH with Session + Cookie
// method call is PERFORMANCE_PATH
// GET /events/:id -> AV performance.load
router.get("/events/:id", async (req, res) => {
  try {
    if (!CURRENT_SESSION) return res.status(401).json({ error: "Not authenticated" });

    const performanceId = req.params.id;
    const url = new URL(PERFORMANCE_PATH, API_BASE).toString();

    const payload = {
      actions: [
        {
          method: "load",
          params: { Performance: { performance_id: performanceId } }
        }
      ],
      get: ["Performance"]
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

    // merge any cookies the endpoint sets
    const setCookie = r.headers.get("set-cookie");
    if (setCookie) {
      const pairs = parseSetCookieHeader(setCookie);
      setCookies(mergeCookiePairs(getCookies(), pairs));
    }

    const raw = await r.text();
    let data; try { data = JSON.parse(raw); } catch { data = raw; }

    if (!r.ok) {
      return res.status(r.status).json({ error: "performance.load failed", details: data });
    }

    // AV usually returns { data: { Performance: {...fields...} } }
    const perf = data?.data?.Performance;
    if (!perf) {
      return res.status(404).json({ error: "Performance not found", details: data });
    }

    // return the object as-is; your front-end expects { name: {standard}, ... }
    res.json(perf);
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// POST /map/pricing/:id -> AV map.loadMap (get pricing only)
router.post("/map/pricing/:id", async (req, res) => {
  try {
    if (!CURRENT_SESSION) return res.status(401).json({ error: "Not authenticated" });
    if (!MAP_PATH) return res.status(500).json({ error: "MAP_PATH not configured" });

    const performanceId = req.params.id;
    const { promocode_access_code = "" } = req.body || {};
    const url = new URL(MAP_PATH, API_BASE).toString();

    const payload = {
      actions: [
        {
          method: "loadBestAvailable",
          params: { performance_ids: [performanceId] }
        },
        {
          method: "loadAvailability",
          params: { performance_ids: [performanceId] }
        }
      ],
      get: ["pricetypes"]
    };

    const r = await fetch(url, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload)
    });

    const setCookie = r.headers.get("set-cookie");
    if (setCookie) {
      const pairs = parseSetCookieHeader(setCookie);
      setCookies(mergeCookiePairs(getCookies(), pairs));
    }

    const raw = await r.text();
    let data; try { data = JSON.parse(raw); } catch { data = raw; }
    const pricetypes = data?.data?.pricetypes;
    if (!r.ok) return res.status(r.status).json({ error: "loadMap(pricing) failed", details: data });

    res.json({ pricetypes });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});


export default router;
