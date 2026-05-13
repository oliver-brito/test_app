// server/routes/customer.js — customer-facing endpoints (account page).
import express from "express";
import { ENDPOINTS } from "../../public/js/endpoints.js";
import { printDebugMessage } from "../utils/debug.js";
import { av } from "../services/av.js";
import { handler } from "../middleware/handler.js";
import { ApiError } from "../middleware/errorHandler.js";
import { MY_CUSTOMER } from "../av/objectNames.js";
import { CUSTOMER, PAYMENTS, CONTACTS, ADDRESSES } from "../av/fields.js";

const router = express.Router();
const { CUSTOMER: CUSTOMER_PATH } = ENDPOINTS;

const getMyAccountDetails = handler({
  async run() {
    const { data } = await av
      .on(MY_CUSTOMER)
      .get(CUSTOMER, PAYMENTS, CONTACTS, ADDRESSES)
      .post(CUSTOMER_PATH)
      .orFail("Failed to load customer details");

    // av-avon soft-error pattern: 200 status but an errorCode/message in the body.
    if (data?.errorCode || /error/i.test(data?.message || "")) {
      printDebugMessage("Customer details soft error detected");
      const isAuthError = data?.errorCode === "99" || data?.errorCode === 99;
      throw new ApiError(isAuthError ? 401 : 400, "Upstream error", { details: data });
    }

    printDebugMessage("Customer details retrieval successful");
    return { success: true, response: data };
  },
});

// Placeholders — wired up to the UI but not implemented against av-avon yet.
const notImplemented = handler({
  async run() {
    throw new ApiError(501, "Not implemented");
  },
});

router.post("/getMyAccountDetails",       getMyAccountDetails);
router.post("/addNewPaymentMethod",        notImplemented);
router.post("/getSaveablePaymentMethods",  notImplemented);

export default router;
