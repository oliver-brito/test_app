// server/routes/details.js — read-only views over the active order.
import express from "express";
import { ENDPOINTS } from "../../public/js/endpoints.js";
import { printDebugMessage } from "../utils/debug.js";
import { av } from "../services/av.js";
import { unwrap } from "../services/avResponse.js";
import { handler } from "../middleware/handler.js";
import { MY_ORDER } from "../av/objectNames.js";
import { ORDER, ADMISSIONS, PAYMENTS } from "../av/fields.js";

const { ORDER: ORDER_PATH } = ENDPOINTS;
const router = express.Router();

const getOrder = handler({
  async run() {
    const { data } = await av
      .on(MY_ORDER)
      .get(ORDER, ADMISSIONS)
      .post(ORDER_PATH)
      .orFail("Failed to fetch order details");

    printDebugMessage("Order details fetched successfully");
    return {
      success: true,
      order: unwrap(data, ORDER) || {},
      rawResponse: data,
      admissions: unwrap(data, ADMISSIONS) || {},
    };
  },
});

const getPaymentDetails = handler({
  async run() {
    const { data } = await av
      .on(MY_ORDER)
      .get(PAYMENTS)
      .post(ORDER_PATH)
      .orFail("Failed to fetch payment details");

    printDebugMessage("Payment details fetched successfully");
    return {
      success: true,
      payments: unwrap(data, PAYMENTS) || {},
      rawResponse: data,
    };
  },
});

router.get("/order",   getOrder);
router.get("/details", getPaymentDetails);

export default router;
