// endpoints/routes/events.js (refactored to use common helpers)
import express from "express";
import { ENDPOINTS } from "../../public/endpoints.js";
import { printDebugMessage } from "../utils/debug.js";
import { validateCall, sendCall, handleSetCookies } from "../utils/common.js";

const { UPCOMING: UPCOMING_PATH, ORDER: ORDER_PATH, PERFORMANCE: PERFORMANCE_PATH, MAP: MAP_PATH } = ENDPOINTS;

const router = express.Router();

// GET /events/upcoming -> Retrieve upcoming events list
router.get("/events/upcoming", async (req, res) => {
  try {
    const expectedPaths = ["UPCOMING_PATH"]; // for visibility/logging only right now
    validateCall(req, [], expectedPaths, "events/upcoming");

    const movePage = parseInt(req.query.movePage);
    const method = movePage === 1 ? "nextPage" : movePage === -1 ? "prevPage" : "search";
    const payload = {
      actions: [{ method }],
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

    const response = await sendCall(UPCOMING_PATH, payload);
    await handleSetCookies(response);

    const rawText = await response.text();
    let data; try { data = JSON.parse(rawText); } catch { data = rawText; }

    if (!response.ok) {
      printDebugMessage(`Events upcoming fetch failed: ${response.status}`);
      return res.status(response.status).json({ error: "Upcoming failed", details: data });
    }

    if (data?.errorCode || /error/i.test(data?.message || "")) {
      printDebugMessage("Events upcoming soft error");
      return res.status(400).json({ error: "Upstream error", details: data });
    }

    const resultsObj = data?.data?.SearchResults || {};
    const events = Object.values(resultsObj);
    printDebugMessage("Events upcoming fetched successfully");
    res.json({ events, rawResponse: data });
  } catch (err) {
    printDebugMessage(`Error in /events/upcoming: ${err.message}`);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// POST /map/availability/:id -> getBestAvailable seats
router.post("/map/availability/:id", async (req, res) => {
  try {
    const expectedPaths = ["ORDER_PATH"];
    // Expect priceTypeId & numSeats in body
    validateCall(req, ["priceTypeId", "numSeats"], expectedPaths, "map/availability");

    const performanceId = req.params.id;
    const { priceTypeId, numSeats } = req.body;
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

    const response = await sendCall(ORDER_PATH, payload);
    await handleSetCookies(response);
    const raw = await response.text();
    let data; try { data = JSON.parse(raw); } catch { data = raw; }

    if (!response.ok) {
      printDebugMessage(`Map availability fetch failed: ${response.status}`);
      return res.status(response.status).json({ error: "getBestAvailable failed", details: data });
    }

    printDebugMessage("Map availability fetched successfully");
    res.json(data);
  } catch (err) {
    printDebugMessage(`Error in /map/availability: ${err.message}`);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// GET /events/:id -> performance.load
router.get("/events/:id", async (req, res) => {
  try {
    const expectedPaths = ["PERFORMANCE_PATH"];
    validateCall(req, [], expectedPaths, "events/:id");

    const performanceId = req.params.id;
    const payload = {
      actions: [
        {
          method: "load",
          params: { Performance: { performance_id: performanceId } }
        }
      ],
      get: ["Performance"],
      objectName: "myPerformance"
    };

    const response = await sendCall(PERFORMANCE_PATH, payload);
    await handleSetCookies(response);
    const raw = await response.text();
    let data; try { data = JSON.parse(raw); } catch { data = raw; }

    if (!response.ok) {
      printDebugMessage(`Performance load failed: ${response.status}`);
      return res.status(response.status).json({ error: "performance.load failed", details: data });
    }

    const perf = data?.data?.Performance;
    if (!perf) {
      printDebugMessage("Performance not found");
      return res.status(404).json({ error: "Performance not found", details: data });
    }

    printDebugMessage("Performance loaded successfully");
    res.json({ performance: perf, rawResponse: data });
  } catch (err) {
    printDebugMessage(`Error in /events/:id: ${err.message}`);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// POST /map/pricing/:id -> map pricing (loadBestAvailable + loadAvailability pricetypes)
router.post("/map/pricing/:id", async (req, res) => {
  try {
    const expectedPaths = ["MAP_PATH"];
    validateCall(req, [], expectedPaths, "map/pricing");

    const performanceId = req.params.id;
    const payload = {
      actions: [
        { method: "loadBestAvailable", params: { performance_ids: [performanceId] } },
        { method: "loadAvailability", params: { performance_ids: [performanceId] } }
      ],
      get: ["pricetypes"],
      objectName: "myMap"
    };

    const response = await sendCall(MAP_PATH, payload);
    await handleSetCookies(response);
    const raw = await response.text();
    let data; try { data = JSON.parse(raw); } catch { data = raw; }

    if (!response.ok) {
      printDebugMessage(`Map pricing fetch failed: ${response.status}`);
      return res.status(response.status).json({ error: "loadMap(pricing) failed", details: data });
    }

    const pricetypes = data?.data?.pricetypes || {};
    printDebugMessage("Map pricing fetched successfully");
    res.json({ pricetypes, rawResponse: data });
  } catch (err) {
    printDebugMessage(`Error in /map/pricing: ${err.message}`);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

export default router;
