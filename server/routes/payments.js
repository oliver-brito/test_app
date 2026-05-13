// server/routes/payments.js
import express from "express";
import { printDebugMessage } from "../utils/debug.js";
import { classifyException } from "../services/apiErrors.js";
import { validate } from "../middleware/validate.js";
import { TransactionBody, CheckoutBody } from "../schemas/payments.js";
import { insertOrder, redirectToViewOrder } from "../services/order.js";
import { handleThreeDS } from "../services/threeDSChallenge.js";
import { runCheckoutSequence } from "../services/checkout/orchestrator.js";

const router = express.Router();

// POST /transaction -> Process payment transaction via AudienceView API
router.post("/transaction", express.json(), validate(TransactionBody), async (req, res) => {
  const { paymentId } = req.body;

  const { response, data } = await insertOrder();

  if (!response.ok) {
    // av-avon exception 4294 means the payment requires a 3DS challenge.
    if (classifyException(data) === "threeDS") {
      printDebugMessage("Transaction requires 3DS authentication");
      return handleThreeDS(req, res, { paymentID: paymentId });
    }
    printDebugMessage(`Transaction failed: ${response.status}`);
    return res.status(response.status).json({ success: false, error: "Transaction failed", details: data });
  }

  const orderNumber = data?.data?.["Order::order_number"]?.standard;
  const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

  printDebugMessage("Transaction completed successfully");
  return redirectToViewOrder({
    orderNumber,
    transactionId,
    actionsJson: data,
    respJson: data,
    paymentMethod: "N/A",
  }, res);
});

router.post("/checkout", express.json(), validate(CheckoutBody), async (req, res) => {
  const { deliveryMethod, paymentMethod } = req.body;

  const paResponseURL = `${req.protocol}://${req.get("host")}/checkout.html`;
  const result = await runCheckoutSequence(res, { deliveryMethod, paymentMethod, paResponseURL });
  if (!result) return; // Error already handled

  printDebugMessage("Checkout completed successfully");
  res.json(result);
});

export default router;