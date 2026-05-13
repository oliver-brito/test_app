// server/routes/customer.js — customer-facing endpoints (account page).
import express from "express";
import { ENDPOINTS } from "../../public/js/endpoints.js";
import { printDebugMessage } from "../utils/debug.js";
import { callAvManaged } from "../services/avClient.js";
import { MY_CUSTOMER } from "../av/objectNames.js";
import { CUSTOMER, PAYMENTS, CONTACTS, ADDRESSES } from "../av/fields.js";

const router = express.Router();
const { CUSTOMER: CUSTOMER_PATH } = ENDPOINTS;

router.post("/getMyAccountDetails", express.json(), async (req, res) => {
  const result = await callAvManaged(
    
    CUSTOMER_PATH,
    { get: [CUSTOMER, PAYMENTS, CONTACTS, ADDRESSES], objectName: MY_CUSTOMER },
    "Failed to load customer details"
  );

  // av-avon soft-error pattern: 200 status but an errorCode/message in the body.
  if (result.data?.errorCode || /error/i.test(result.data?.message || "")) {
    printDebugMessage("Customer details soft error detected");
    const isAuthError = result.data?.errorCode === "99" || result.data?.errorCode === 99;
    return res.status(isAuthError ? 401 : 400).json({
      error: "Upstream error",
      details: result.data,
      backendApiCalls: result.apiCallMetadata ? [result.apiCallMetadata] : [],
    });
  }

  printDebugMessage("Customer details retrieval successful");
  res.json({
    success: true,
    response: result.data,
    backendApiCalls: [result.apiCallMetadata],
  });
});

// Placeholders — wired up to the UI but not implemented against av-avon yet.
router.post("/addNewPaymentMethod", express.json(), async (req, res) => {
  res.status(501).json({ error: "Not implemented" });
});

router.post("/getSaveablePaymentMethods", express.json(), async (req, res) => {
  res.status(501).json({ error: "Not implemented" });
});

export default router;
