// server/routes/events.js — events catalog, performance detail, and the
// "map" endpoints that build the seat-selection UI (best-available seats,
// price types, delivery + payment options).
import express from "express";
import { ENDPOINTS } from "../../public/js/endpoints.js";
import { printDebugMessage } from "../utils/debug.js";
import { callAvManaged } from "../services/avClient.js";
import { unwrap } from "../services/avResponse.js";
import { validate } from "../middleware/validate.js";
import { MapAvailabilityBody } from "../schemas/seats.js";
import {
  MY_ORDER,
  MY_PERFORMANCE,
  MY_MAP,
  MY_SEARCH_RESULTS,
} from "../av/objectNames.js";
import {
  SEARCH,
  NEXT_PAGE,
  PREV_PAGE,
  LOAD,
  GET_BEST_AVAILABLE,
  LOAD_BEST_AVAILABLE,
  LOAD_AVAILABILITY,
} from "../av/methods.js";
import {
  ADMISSIONS,
  AVAILABLE_PAYMENT_METHODS,
  DELIVERY_METHOD_DETAILS,
  PERFORMANCE,
  PRICETYPES,
  SEARCH_RESULTS,
  SEARCH_OBJECT_TYPE,
  SEARCH_QUERY,
  SEARCH_FROM,
  SEARCH_TO,
  SEARCH_TOTAL_RECORDS,
  SEARCH_CURRENT_PAGE,
  SEARCH_TOTAL_PAGES,
} from "../av/fields.js";

const {
  UPCOMING: UPCOMING_PATH,
  ORDER: ORDER_PATH,
  PERFORMANCE: PERFORMANCE_PATH,
  MAP: MAP_PATH,
} = ENDPOINTS;
const router = express.Router();

/** Translate the UI's pagination intent (next/prev/initial) to an av-avon method name. */
const pageMethod = (movePage) =>
  movePage === 1 ? NEXT_PAGE : movePage === -1 ? PREV_PAGE : SEARCH;

router.get("/events/upcoming", async (req, res) => {
  const movePage = parseInt(req.query.movePage);
  const objectType = req.query.objectType || "P";

  const payload = {
    actions: [{ method: pageMethod(movePage) }],
    set: {
      [SEARCH_OBJECT_TYPE]: objectType,
      [SEARCH_QUERY]: "",
      [SEARCH_FROM]: "",
      [SEARCH_TO]: "",
    },
    get: [SEARCH_TOTAL_RECORDS, SEARCH_CURRENT_PAGE, SEARCH_TOTAL_PAGES, SEARCH_RESULTS],
    objectName: MY_SEARCH_RESULTS,
  };

  const result = await callAvManaged(UPCOMING_PATH, payload, "Upcoming failed");

  if (result.data?.errorCode || /error/i.test(result.data?.message || "")) {
    printDebugMessage("Events upcoming soft error");
    return res.status(400).json({
      error: "Upstream error",
      details: result.data,
      backendApiCalls: result.apiCallMetadata ? [result.apiCallMetadata] : [],
    });
  }

  const events = Object.values(unwrap(result.data, SEARCH_RESULTS) || {});
  printDebugMessage("Events upcoming fetched successfully");
  res.json({
    events,
    rawResponse: result.data,
    backendApiCalls: result.apiCallMetadata ? [result.apiCallMetadata] : [],
  });
});

router.post(
  "/map/availability/:id",
  express.json(),
  validate(MapAvailabilityBody),
  async (req, res) => {
    const performanceId = req.params.id;
    const { priceTypeId, numSeats } = req.body;

    const payload = {
      actions: [
        {
          method: GET_BEST_AVAILABLE,
          params: {
            perfVector: [performanceId],
            reqRows: "1",
            [`reqNum::${priceTypeId}`]: String(numSeats),
            optNum: "2",
          },
        },
      ],
      get: [ADMISSIONS, AVAILABLE_PAYMENT_METHODS, DELIVERY_METHOD_DETAILS],
      objectName: MY_ORDER,
    };

    const result = await callAvManaged(ORDER_PATH, payload, "getBestAvailable failed");

    printDebugMessage("Map availability fetched successfully");
    res.json({
      ...result.data,
      backendApiCalls: result.apiCallMetadata ? [result.apiCallMetadata] : [],
    });
  }
);

router.get("/events/:id", async (req, res) => {
  const performanceId = req.params.id;
  const payload = {
    actions: [{ method: LOAD, params: { Performance: { performance_id: performanceId } } }],
    get: [PERFORMANCE],
    objectName: MY_PERFORMANCE,
  };

  const result = await callAvManaged(PERFORMANCE_PATH, payload, "performance.load failed");

  const perf = unwrap(result.data, PERFORMANCE);
  if (!perf) {
    printDebugMessage("Performance not found");
    return res.status(404).json({
      error: "Performance not found",
      details: result.data,
      backendApiCalls: result.apiCallMetadata ? [result.apiCallMetadata] : [],
    });
  }

  printDebugMessage("Performance loaded successfully");
  res.json({
    performance: perf,
    rawResponse: result.data,
    backendApiCalls: result.apiCallMetadata ? [result.apiCallMetadata] : [],
  });
});

router.post("/map/pricing/:id", async (req, res) => {
  const performanceId = req.params.id;
  const payload = {
    actions: [
      { method: LOAD_BEST_AVAILABLE, params: { performance_ids: [performanceId] } },
      { method: LOAD_AVAILABILITY, params: { performance_ids: [performanceId] } },
    ],
    get: [PRICETYPES],
    objectName: MY_MAP,
  };

  const result = await callAvManaged(MAP_PATH, payload, "loadMap(pricing) failed");

  printDebugMessage("Map pricing fetched successfully");
  res.json({
    pricetypes: unwrap(result.data, PRICETYPES) || {},
    rawResponse: result.data,
    backendApiCalls: result.apiCallMetadata ? [result.apiCallMetadata] : [],
  });
});

export default router;
