// routes/3ds.js
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { CURRENT_SESSION } from "../utils/sessionStore.js"; // current session reference
import { ENDPOINTS } from "../../public/endpoints.js"; // public endpoints constants
import { validateCall, sendCall, handleSetCookies } from "../utils/common.js"; // shared validation & fetch & cookie wrapper
import { insertOrder, redirectToViewOrder } from "./common.js"; // order helpers

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const router = express.Router();

// --- Environment variables from .env
const { API_BASE } = process.env;
const { ORDER: ORDER_PATH } = ENDPOINTS;

router.post("/processThreeDSResponse", async (req, res) => {
    try {
        var expectedParams = ["paymentId", "pa_response_information", "pa_response_URL"];
        var expectedPaths = ["ORDER_PATH"];
        validateCall(req, expectedParams, expectedPaths, "processThreeDSResponse");
        if (!CURRENT_SESSION) {
            return res.status(401).json({ error: "Not authenticated" });
        }

        const { paymentId, pa_response_information, pa_response_URL } = req.body || {};
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
        let resp = await sendCall(ORDER_PATH, outboundBody, true);
        const respText = await resp.text();
        let respJson = null;
        try { respJson = JSON.parse(respText); } catch (e) { /* ignore parse error */ }
        await handleSetCookies(resp);
        if (!resp.ok) return res.status(resp.status).json({ status: resp.status, body: respJson || respText });

        /**
         * Finalize the order by calling insertOrder to complete the payment process.
         * This will insert the order and use the information in pa_response_information
         * to process the payment.
         */
        var actionsResp = await insertOrder();
        const actionsText = await actionsResp.text();
        let actionsJson = null;
        try { actionsJson = JSON.parse(actionsText); } catch (e) { /* ignore */ }
        await handleSetCookies(actionsResp);
        if (!actionsResp.ok) return res.status(actionsResp.status).json({ status: actionsResp.status, body: actionsJson || actionsText });

        /** We have successfully processed 3DS and finalized the order 
         * The following extracts order details for redirection. This is not part of the API response,
         * is just a visual indicator in the test app to show order completion.
        */
        const orderNumber = (actionsJson?.data?.["Order::order_number"]?.standard) || (respJson?.data?.["Order::order_number"]?.standard) || null;
        const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
        const redirectUrl = `/viewOrder.html?orderId=${orderNumber || transactionId}&transactionId=${transactionId}`;
        var orderDetails = {
            orderNumber,
            transactionId,
            redirectUrl,
            actionsJson: actionsJson,
            respJson: respJson,
            paymentMethod: "3DS Payment"
        };
        return redirectToViewOrder(orderDetails, res);
    }
    catch (err) {
        res.status(500).json({ error: String(err?.message || err) });
    }
});

export default router;