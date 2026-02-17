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
        // Step 0: get the customer_id from the session
        const payload = {
            session: {
                get: ["customer_id"]
            }
        };
        const result = await makeApiCallWithErrorHandling(
            res, USER_PATH, payload, "Failed to retrieve customer_id from session");
        if (!result) return; // Error already handled

        var customer_id = result.data?.customer_id?.standard || null;
        if (!customer_id) {
            printDebugMessage("Customer ID not found in session");
            return res.status(400).json({ success: false, message: "Customer ID not found in session" });
        }
        
        // Step 1: load the customer details using the customer_id
        const customerPayload = {
            actions: [
                {
                    method: "load",
                    params: { "Customer::customer_id": customer_id }
                }
            ],
            get: ["Customer", "Payments", "Addresses"],
            objectName: "myCustomer"
        };
        const customerResult = await makeApiCallWithErrorHandling(
            res, CUSTOMER_PATH, customerPayload, "Failed to load customer details");
        if (!customerResult) return; // Error already handled
        printDebugMessage('Customer details retrieval successful');
        res.json({ success: true, response: customerResult.data });
    },
    { paths: ["USER_PATH", "CUSTOMER_PATH"], name: "getMyAccountDetails" }
));

export default router;