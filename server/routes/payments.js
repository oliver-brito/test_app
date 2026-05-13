// server/routes/payments.js — generic payment lifecycle (used for the
// non-Adyen / hosted-fields flow). Adyen-specific endpoints live in
// routes/adyen.js.
import express from "express";
import { printDebugMessage } from "../utils/debug.js";
import { classifyException } from "../services/apiErrors.js";
import { unwrap } from "../services/avResponse.js";
import { validate } from "../middleware/validate.js";
import { TransactionBody, CheckoutBody } from "../schemas/payments.js";
import { insertOrder, redirectToViewOrder } from "../services/order.js";
import { handleThreeDS } from "../services/threeDSChallenge.js";
import { runCheckoutSequence } from "../services/checkout/orchestrator.js";
import { ORDER_NUMBER } from "../av/fields.js";

const router = express.Router();

/** Generate a UI-only transaction id; av-avon's own order_number lives on the order record. */
const newTransactionId = () =>
  `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

router.post("/transaction", express.json(), validate(TransactionBody), async (req, res) => {
  const { paymentId } = req.body;

  const { response, data } = await insertOrder();

  if (!response.ok) {
    if (classifyException(data) === "threeDS") {
      printDebugMessage("Transaction requires 3DS authentication");
      return handleThreeDS(req, res, { paymentId });
    }
    printDebugMessage(`Transaction failed: ${response.status}`);
    return res
      .status(response.status)
      .json({ success: false, error: "Transaction failed", details: data });
  }

  const orderNumber = unwrap(data, ORDER_NUMBER)?.standard;
  printDebugMessage("Transaction completed successfully");
  return redirectToViewOrder(
    {
      orderNumber,
      transactionId: newTransactionId(),
      actionsJson: data,
      respJson: data,
      paymentMethod: "N/A",
    },
    res
  );
});

router.post("/checkout", express.json(), validate(CheckoutBody), async (req, res) => {
  const { deliveryMethod, paymentMethod } = req.body;
  const paResponseURL = `${req.protocol}://${req.get("host")}/checkout.html`;

  const result = await runCheckoutSequence(res, { deliveryMethod, paymentMethod, paResponseURL });
  printDebugMessage("Checkout completed successfully");
  res.json(result);
});

export default router;
