// server/routes/details.js
import express from "express";
import { printDebugMessage } from "../utils/debug.js";
import { ENDPOINTS } from "../../public/js/endpoints.js";
import { callAvManaged } from "../services/avClient.js";

const { ORDER: ORDER_PATH } = ENDPOINTS;
const router = express.Router();

// GET /order -> Retrieve order details from AudienceView
router.get("/order", async (req, res) => {
  const payload = {
    get: ["Order", "Admissions"],
    objectName: "myOrder",
  };

  const result = await callAvManaged(
    res, ORDER_PATH, payload, "Failed to fetch order details"
  );
  if (!result) return;

  printDebugMessage("Order details fetched successfully");
  res.json({
    success: true,
    order: result.data?.data?.Order || {},
    rawResponse: result.data,
    admissions: result.data?.data?.Admissions || {},
  });
});

// GET /details -> Retrieve payment details from AudienceView
router.get("/details", async (req, res) => {
  const payload = {
    get: ["Payments"],
    objectName: "myOrder",
  };

  const result = await callAvManaged(
    res, ORDER_PATH, payload, "Failed to fetch payment details"
  );
  if (!result) return;

  printDebugMessage("Payment details fetched successfully");
  res.json({
    success: true,
    payments: result.data?.data?.Payments || {},
    rawResponse: result.data,
  });
});

export default router;
