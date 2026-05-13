// server/routes/events.js — events catalog, performance detail, and the
// "map" endpoints that build the seat-selection UI (best-available seats,
// price types, delivery + payment options).
import express from "express";
import { ENDPOINTS } from "../../public/js/endpoints.js";
import { printDebugMessage } from "../utils/debug.js";
import { av } from "../services/av.js";
import { unwrap } from "../services/avResponse.js";
import { handler } from "../middleware/handler.js";
import { ApiError } from "../middleware/errorHandler.js";
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

const listUpcoming = handler({
  async run({ movePage, objectType = "P" }) {
    const { data } = await av
      .on(MY_SEARCH_RESULTS)
      .action(pageMethod(parseInt(movePage)))
      .set({
        [SEARCH_OBJECT_TYPE]: objectType,
        [SEARCH_QUERY]: "",
        [SEARCH_FROM]: "",
        [SEARCH_TO]: "",
      })
      .get(SEARCH_TOTAL_RECORDS, SEARCH_CURRENT_PAGE, SEARCH_TOTAL_PAGES, SEARCH_RESULTS)
      .post(UPCOMING_PATH)
      .orFail("Upcoming failed");

    if (data?.errorCode || /error/i.test(data?.message || "")) {
      throw new ApiError(400, "Upstream error", { details: data });
    }

    printDebugMessage("Events upcoming fetched successfully");
    return {
      success: true,
      events: Object.values(unwrap(data, SEARCH_RESULTS) || {}),
      rawResponse: data,
    };
  },
});

const mapAvailability = handler({
  body: MapAvailabilityBody,
  async run({ id, priceTypeId, numSeats }) {
    const { data } = await av
      .on(MY_ORDER)
      .action(GET_BEST_AVAILABLE, {
        perfVector: [id],
        reqRows: "1",
        [`reqNum::${priceTypeId}`]: String(numSeats),
        optNum: "2",
      })
      .get(ADMISSIONS, AVAILABLE_PAYMENT_METHODS, DELIVERY_METHOD_DETAILS)
      .post(ORDER_PATH)
      .orFail("getBestAvailable failed");

    printDebugMessage("Map availability fetched successfully");
    // Spread the av-avon body so the UI can read .data.Admissions etc.
    return { success: true, ...data };
  },
});

const getEvent = handler({
  async run({ id }) {
    const { data } = await av
      .on(MY_PERFORMANCE)
      .action(LOAD, { Performance: { performance_id: id } })
      .get(PERFORMANCE)
      .post(PERFORMANCE_PATH)
      .orFail("performance.load failed");

    const performance = unwrap(data, PERFORMANCE);
    if (!performance) {
      throw new ApiError(404, "Performance not found", { details: data });
    }
    printDebugMessage("Performance loaded successfully");
    return { success: true, performance, rawResponse: data };
  },
});

const mapPricing = handler({
  async run({ id }) {
    const { data } = await av
      .on(MY_MAP)
      .action(LOAD_BEST_AVAILABLE, { performance_ids: [id] })
      .action(LOAD_AVAILABILITY,   { performance_ids: [id] })
      .get(PRICETYPES)
      .post(MAP_PATH)
      .orFail("loadMap(pricing) failed");

    printDebugMessage("Map pricing fetched successfully");
    return { success: true, pricetypes: unwrap(data, PRICETYPES) || {}, rawResponse: data };
  },
});

router.get( "/events/upcoming",       listUpcoming);
router.post("/map/availability/:id",  mapAvailability);
router.get( "/events/:id",            getEvent);
router.post("/map/pricing/:id",       mapPricing);

export default router;
