// endpoints/routes/events.js (refactored to use common helpers)
import express from "express";
import { ENDPOINTS } from "../../public/js/endpoints.js";
import { printDebugMessage } from "../utils/debug.js";
import { makeApiCallWithErrorHandling } from "../utils/common.js";
import { wrapRouteWithValidation } from "../utils/routeWrapper.js";

const { UPCOMING: UPCOMING_PATH, ORDER: ORDER_PATH, PERFORMANCE: PERFORMANCE_PATH, MAP: MAP_PATH } = ENDPOINTS;

const router = express.Router();

// GET /events/upcoming -> Retrieve upcoming events list
router.get("/events/upcoming", wrapRouteWithValidation(
  async (req, res) => {
    const movePage = parseInt(req.query.movePage);
    const method = movePage === 1 ? "nextPage" : movePage === -1 ? "prevPage" : "search";
    const payload = {
      actions: [{ method }],
      set: {
        "SearchCriteria::object_type_filter": "",
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

    const result = await makeApiCallWithErrorHandling(
      res, UPCOMING_PATH, payload, "Upcoming failed"
    );
    if (!result) return; // Error already handled

    // Check for soft error
    if (result.data?.errorCode || /error/i.test(result.data?.message || "")) {
      printDebugMessage("Events upcoming soft error");
      return res.status(400).json({
        error: "Upstream error",
        details: result.data,
        backendApiCalls: result.apiCallMetadata ? [result.apiCallMetadata] : []
      });
    }

    const resultsObj = result.data?.data?.SearchResults || {};
    const events = Object.values(resultsObj);
    printDebugMessage("Events upcoming fetched successfully");
    res.json({
      events,
      rawResponse: result.data,
      backendApiCalls: result.apiCallMetadata ? [result.apiCallMetadata] : []
    });
  },
  { params: [], paths: ["UPCOMING_PATH"], name: "events/upcoming" }
));

// POST /map/availability/:id -> getBestAvailable seats
router.post("/map/availability/:id", wrapRouteWithValidation(
  async (req, res) => {
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

    const result = await makeApiCallWithErrorHandling(
      res, ORDER_PATH, payload, "getBestAvailable failed"
    );
    if (!result) return; // Error already handled

    printDebugMessage("Map availability fetched successfully");
    res.json({
      ...result.data,
      backendApiCalls: result.apiCallMetadata ? [result.apiCallMetadata] : []
    });
  },
  { params: ["priceTypeId", "numSeats"], paths: ["ORDER_PATH"], name: "map/availability" }
));

// GET /events/:id -> performance.load
router.get("/events/:id", wrapRouteWithValidation(
  async (req, res) => {
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

    const result = await makeApiCallWithErrorHandling(
      res, PERFORMANCE_PATH, payload, "performance.load failed"
    );
    if (!result) return; // Error already handled

    const perf = result.data?.data?.Performance;
    if (!perf) {
      printDebugMessage("Performance not found");
      return res.status(404).json({
        error: "Performance not found",
        details: result.data,
        backendApiCalls: result.apiCallMetadata ? [result.apiCallMetadata] : []
      });
    }

    printDebugMessage("Performance loaded successfully");
    res.json({
      performance: perf,
      rawResponse: result.data,
      backendApiCalls: result.apiCallMetadata ? [result.apiCallMetadata] : []
    });
  },
  { params: [], paths: ["PERFORMANCE_PATH"], name: "events/:id" }
));

// POST /map/pricing/:id -> map pricing (loadBestAvailable + loadAvailability pricetypes)
router.post("/map/pricing/:id", wrapRouteWithValidation(
  async (req, res) => {
    const performanceId = req.params.id;
    const payload = {
      actions: [
        { method: "loadBestAvailable", params: { performance_ids: [performanceId] } },
        { method: "loadAvailability", params: { performance_ids: [performanceId] } }
      ],
      get: ["pricetypes"],
      objectName: "myMap"
    };

    const result = await makeApiCallWithErrorHandling(
      res, MAP_PATH, payload, "loadMap(pricing) failed"
    );
    if (!result) return; // Error already handled

    const pricetypes = result.data?.data?.pricetypes || {};
    printDebugMessage("Map pricing fetched successfully");
    res.json({
      pricetypes,
      rawResponse: result.data,
      backendApiCalls: result.apiCallMetadata ? [result.apiCallMetadata] : []
    });
  },
  { params: [], paths: ["MAP_PATH"], name: "map/pricing" }
));

export default router;
