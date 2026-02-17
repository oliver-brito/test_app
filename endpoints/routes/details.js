// endpoints/routes/details.js
import express from "express";
import { printDebugMessage } from "../utils/debug.js";
import { ENDPOINTS } from "../../public/js/endpoints.js";
import { makeApiCallWithErrorHandling } from "../utils/common.js";
import { wrapRouteWithValidation } from "../utils/routeWrapper.js";

const { ORDER: ORDER_PATH } = ENDPOINTS;

const router = express.Router();

// GET /order -> Retrieve order details from AudienceView
router.get("/order", wrapRouteWithValidation(
  async (req, res) => {
    /* Payload to get the Order and Admissions objects from the order */
    const payload = {
      get: ["Order", "Admissions"],
      objectName: "myOrder"
    };

    const result = await makeApiCallWithErrorHandling(
      res, ORDER_PATH, payload, "Failed to fetch order details"
    );
    if (!result) return; // Error already handled

    printDebugMessage('Order details fetched successfully');

    res.json({
      success: true,
      order: result.data?.data?.Order || {},
      rawResponse: result.data,
      admissions: result.data?.data?.Admissions || {}
    });
  },
  { params: [], paths: ["ORDER_PATH"], name: "order" }
));

// GET /details -> Retrieve payment details from AudienceView
router.get("/details", wrapRouteWithValidation(
  async (req, res) => {
    /* Payload to get the Payments object from the order */
    const payload = {
      get: ["Payments"],
      objectName: "myOrder"
    };

    const result = await makeApiCallWithErrorHandling(
      res, ORDER_PATH, payload, "Failed to fetch payment details"
    );
    if (!result) return; // Error already handled

    printDebugMessage('Payment details fetched successfully');
    res.json({
      success: true,
      payments: result.data?.data?.Payments || {},
      rawResponse: result.data
    });
  },
  { params: [], paths: ["ORDER_PATH"], name: "details" }
));

export default router;
