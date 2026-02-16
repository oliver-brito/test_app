// routes/payments.js (refactored to use common helpers)
import express from "express";
import { ENDPOINTS } from "../../public/endpoints.js";
import { printDebugMessage } from "../utils/debug.js";
import { parseResponse, handleSetCookies, is3dsRequired } from "../utils/common.js";
import { insertOrder, redirectToViewOrder, handleThreeDS, executeCheckoutSequence } from "./common.js";
import { wrapRouteWithValidation } from "../utils/routeWrapper.js";

const router = express.Router();
const { ORDER: ORDER_PATH } = ENDPOINTS; // Adyen-specific routes moved to adyen.js

// POST /transaction -> Process payment transaction via AudienceView API
router.post("/transaction", express.json(), wrapRouteWithValidation(
  async (req, res) => {
    const { paymentId } = req.body;

    const response = await insertOrder();
    await handleSetCookies(response);
    const data = await parseResponse(response);

    if (!response.ok) {
      /** When the error is 4294, that means that the payment requires a 3DS confirmation
       * to be fully processed.
       * This is a common requirement for card payments to prevent fraud.
       * So, when receiving this error, we should handle it accordingly.
       */
      if (is3dsRequired(data)) {
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
      paymentMethod: "N/A"
    }, res);
  },
  { params: ["paymentId"], paths: ["ORDER_PATH"], name: "transaction" }
));


router.post("/checkout", express.json(), wrapRouteWithValidation(
  async (req, res) => {
    const { deliveryMethod, paymentMethod } = req.body;

    const result = await executeCheckoutSequence(res, deliveryMethod, paymentMethod);
    if (!result) return; // Error already handled

    printDebugMessage("Checkout completed successfully");
    res.json(result);
  },
  { params: ["deliveryMethod", "paymentMethod"], paths: ["ORDER_PATH"], name: "checkout" }
));

export default router;