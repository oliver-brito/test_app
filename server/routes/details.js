// server/routes/details.js — read-only views over the active order.
import express from "express";
import { ENDPOINTS } from "../../public/js/endpoints.js";
import { printDebugMessage } from "../utils/debug.js";
import { callAvManaged } from "../services/avClient.js";
import { unwrap } from "../services/avResponse.js";
import { MY_ORDER } from "../av/objectNames.js";
import { ORDER, ADMISSIONS, PAYMENTS } from "../av/fields.js";

const { ORDER: ORDER_PATH } = ENDPOINTS;
const router = express.Router();

router.get("/order", async (req, res) => {
  const result = await callAvManaged(
    res,
    ORDER_PATH,
    { get: [ORDER, ADMISSIONS], objectName: MY_ORDER },
    "Failed to fetch order details"
  );
  if (!result) return;

  printDebugMessage("Order details fetched successfully");
  res.json({
    success: true,
    order: unwrap(result.data, ORDER) || {},
    rawResponse: result.data,
    admissions: unwrap(result.data, ADMISSIONS) || {},
  });
});

router.get("/details", async (req, res) => {
  const result = await callAvManaged(
    res,
    ORDER_PATH,
    { get: [PAYMENTS], objectName: MY_ORDER },
    "Failed to fetch payment details"
  );
  if (!result) return;

  printDebugMessage("Payment details fetched successfully");
  res.json({
    success: true,
    payments: unwrap(result.data, PAYMENTS) || {},
    rawResponse: result.data,
  });
});

export default router;
