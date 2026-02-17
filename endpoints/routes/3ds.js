// routes/3ds.js
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { ENDPOINTS } from "../../public/js/endpoints.js"; // public endpoints constants
import { makeApiCallWithErrorHandling, parseResponse, handleSetCookies } from "../utils/common.js"; // shared validation & fetch & cookie wrapper
import { insertOrder, redirectToViewOrder } from "./common.js"; // order helpers
import { wrapRouteWithValidation } from "../utils/routeWrapper.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const router = express.Router();

const { ORDER: ORDER_PATH } = ENDPOINTS;

router.post("/processThreeDSResponse", wrapRouteWithValidation(
    async (req, res) => {
        const { paymentId, pa_response_information, pa_response_URL } = req.body;
        const paymentsKeyBase = `Payments::${paymentId}`;

        /**
         * Payload to submit 3DS response information.
         * - pa_response_information: The PARes value returned from the 3DS authentication, encoded.
         * - pa_response_URL: The URL to redirect the user after 3DS authentication.
         */
        const outboundBody = {
            set: {
                [`${paymentsKeyBase}::pa_response_information`]: pa_response_information,
                [`${paymentsKeyBase}::pa_response_URL`]: pa_response_URL
            },
            objectName: "myOrder",
            get: ["Payments"]
        };

        /**
         * Submit the 3DS response information to the ORDER endpoint.
         * This will set the fields and return the updated Payments object.
         */
        const result = await makeApiCallWithErrorHandling(
            res, ORDER_PATH, outboundBody, "Failed to submit 3DS response", { manual: true }
        );
        if (!result) return; // Error already handled

        // Collect backend API calls for frontend logging
        const backendApiCalls = [];
        if (result.apiCallMetadata) {
            backendApiCalls.push(result.apiCallMetadata);
        }

        /**
         * Finalize the order by calling insertOrder to complete the payment process.
         * This will insert the order and use the information in pa_response_information
         * to process the payment.
         */
        const actionsResp = await insertOrder();
        await handleSetCookies(actionsResp);
        const actionsJson = await parseResponse(actionsResp);

        if (!actionsResp.ok) {
            return res.status(actionsResp.status).json({
                status: actionsResp.status,
                body: actionsJson,
                backendApiCalls // Include backend API calls
            });
        }

        /** We have successfully processed 3DS and finalized the order
         * The following extracts order details for redirection. This is not part of the API response,
         * is just a visual indicator in the test app to show order completion.
        */
        const orderNumber = actionsJson?.data?.["Order::order_number"]?.standard ||
                           result.data?.data?.["Order::order_number"]?.standard || null;
        const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

        return redirectToViewOrder({
            orderNumber,
            transactionId,
            actionsJson,
            respJson: result.data,
            paymentMethod: "3DS Payment",
            backendApiCalls // Include backend API calls
        }, res);
    },
    {
        params: ["paymentId", "pa_response_information", "pa_response_URL"],
        paths: ["ORDER_PATH"],
        name: "processThreeDSResponse"
    }
));

export default router;