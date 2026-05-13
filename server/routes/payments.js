// server/routes/payments.js — generic payment lifecycle (used for the
// non-Adyen / hosted-fields flow). Adyen-specific endpoints live in
// routes/adyen.js.
import express from "express";
import { printDebugMessage } from "../utils/debug.js";
import { classifyException } from "../services/apiErrors.js";
import { unwrap } from "../services/avResponse.js";
import { handler } from "../middleware/handler.js";
import { ApiError } from "../middleware/errorHandler.js";
import { TransactionBody, CheckoutBody } from "../schemas/payments.js";
import { insertOrder, redirectToViewOrder } from "../services/order.js";
import { handleThreeDS } from "../services/threeDSChallenge.js";
import { runCheckoutSequence } from "../services/checkout/orchestrator.js";
import { ORDER_NUMBER } from "../av/fields.js";

const router = express.Router();

/** Generate a UI-only transaction id; av-avon's own order_number lives on the order record. */
const newTransactionId = () =>
  `TXN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

const postTransaction = handler({
  body: TransactionBody,
  async run({ paymentId }, { req, res }) {
    const { response, data } = await insertOrder();

    if (!response.ok) {
      if (classifyException(data) === "threeDS") {
        printDebugMessage("Transaction requires 3DS authentication");
        await handleThreeDS(req, res, { paymentId });
        return; // handleThreeDS already wrote the 402 response
      }
      throw new ApiError(response.status, "Transaction failed", { details: data });
    }

    printDebugMessage("Transaction completed successfully");
    redirectToViewOrder(
      {
        orderNumber: unwrap(data, ORDER_NUMBER)?.standard,
        transactionId: newTransactionId(),
        actionsJson: data,
        respJson: data,
        paymentMethod: "N/A",
      },
      res
    );
    return; // redirectToViewOrder already wrote the 200 response
  },
});

const postCheckout = handler({
  body: CheckoutBody,
  async run({ deliveryMethod, paymentMethod }, { req, res }) {
    const paResponseURL = `${req.protocol}://${req.get("host")}/checkout.html`;
    const result = await runCheckoutSequence(res, { deliveryMethod, paymentMethod, paResponseURL });
    printDebugMessage("Checkout completed successfully");
    return result;
  },
});

router.post("/transaction", postTransaction);
router.post("/checkout",    postCheckout);

export default router;
