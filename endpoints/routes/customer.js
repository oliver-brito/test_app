// routes/seats.js (refactored to use common helpers)
import express from "express";
import { ENDPOINTS } from "../../public/js/endpoints.js";
import { printDebugMessage } from "../utils/debug.js";
import { makeApiCallWithErrorHandling } from "../utils/common.js";
import { wrapRouteWithValidation } from "../utils/routeWrapper.js";

const router = express.Router();
const { CUSTOMER: CUSTOMER_PATH, USER: USER_PATH } = ENDPOINTS;

router.post('/getMyAccountDetails', express.json(), wrapRouteWithValidation(
    async (req, res) => {
        // Step 1: get the customer details using the myCustomer object
        const customerPayload = {
            get: ["Customer", "Payments", "Contacts", "Addresses"],
            objectName: "myCustomer"
        };
        const customerResult = await makeApiCallWithErrorHandling(
            res, CUSTOMER_PATH, customerPayload, "Failed to load customer details");
        if (!customerResult) return; // Error already handled

        // Check for soft error (similar to events.js pattern)
        if (customerResult.data?.errorCode || /error/i.test(customerResult.data?.message || "")) {
            printDebugMessage("Customer details soft error detected");
            const statusCode = (customerResult.data?.errorCode === '99' || customerResult.data?.errorCode === 99) ? 401 : 400;
            return res.status(statusCode).json({
                error: "Upstream error",
                details: customerResult.data,
                backendApiCalls: customerResult.apiCallMetadata ? [customerResult.apiCallMetadata] : []
            });
        }

        printDebugMessage('Customer details retrieval successful');
        res.json({
            success: true,
            response: customerResult.data,
            backendApiCalls: [customerResult.apiCallMetadata]
        });
    },
    { paths: ["USER_PATH", "CUSTOMER_PATH"], name: "getMyAccountDetails" }
));

export default router;