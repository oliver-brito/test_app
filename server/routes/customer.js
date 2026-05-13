// server/routes/customer.js
import express from "express";
import { ENDPOINTS } from "../../public/js/endpoints.js";
import { printDebugMessage } from "../utils/debug.js";
import { makeApiCallWithErrorHandling } from "../utils/common.js";

const router = express.Router();
const { CUSTOMER: CUSTOMER_PATH } = ENDPOINTS;

router.post("/getMyAccountDetails", express.json(), async (req, res) => {
  const customerPayload = {
    get: ["Customer", "Payments", "Contacts", "Addresses"],
    objectName: "myCustomer",
  };
  const customerResult = await makeApiCallWithErrorHandling(
    res, CUSTOMER_PATH, customerPayload, "Failed to load customer details"
  );
  if (!customerResult) return;

  // Soft error (errorCode / message contains "error") — surface as 400 / 401.
  if (customerResult.data?.errorCode || /error/i.test(customerResult.data?.message || "")) {
    printDebugMessage("Customer details soft error detected");
    const statusCode =
      customerResult.data?.errorCode === "99" || customerResult.data?.errorCode === 99 ? 401 : 400;
    return res.status(statusCode).json({
      error: "Upstream error",
      details: customerResult.data,
      backendApiCalls: customerResult.apiCallMetadata ? [customerResult.apiCallMetadata] : [],
    });
  }

  printDebugMessage("Customer details retrieval successful");
  res.json({
    success: true,
    response: customerResult.data,
    backendApiCalls: [customerResult.apiCallMetadata],
  });
});

router.post("/addNewPaymentMethod", express.json(), async (req, res) => {
  // TODO: not yet implemented
  res.status(501).json({ error: "Not implemented" });
});

router.post("/getSaveablePaymentMethods", express.json(), async (req, res) => {
  // TODO: not yet implemented
  res.status(501).json({ error: "Not implemented" });
});

export default router;