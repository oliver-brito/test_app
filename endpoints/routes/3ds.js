// routes/3ds.js
import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { authHeaders } from "../utils/authHeaders.js";
import { parseSetCookieHeader, mergeCookiePairs } from "../utils/cookieUtils.js";
import { getCookies, setCookies } from "../utils/sessionStore.js";
import { CURRENT_SESSION } from "../utils/sessionStore.js";
import { isDebugMode } from "../utils/debug.js";
import { ENDPOINTS } from "../../public/endpoints.js";

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
        if (isDebugMode()) console.log("Starting /processThreeDSResponse route");
        if (!CURRENT_SESSION) {
            return res.status(401).json({ error: "Not authenticated" });
        }
        const {
            PaRes,
            pa_response_information,
            pa_response_URL,
            pa_response_url,
            pa_response_url: pa_response_url_dup,
        } = req.body || {};

        const paResponse = PaRes || pa_response_information || "";
        const paResponseURL = pa_response_URL || pa_response_url || pa_response_url_dup || "";
        console.log("All received 3DS data:", { PaRes, pa_response_information, pa_response_URL, pa_response_url });
        if (!paResponseURL) {
            return res.status(400).json({ error: 'Missing pa_response_URL in request body' });
        }
        if (!paResponse) {
            return res.status(400).json({ error: 'Missing PARes / pa_response_information in request body' });
        }
        const paymentId = req.body.paymentId || req.body.payment_id;
        if (!paymentId) {
            return res.status(400).json({ error: 'Missing paymentId in request body' });
        }

        const paymentsKeyBase = `Payments::${paymentId}`;

        const outboundBody = {
            set: {
                [`${paymentsKeyBase}::pa_response_information`]: paResponse,
                [`${paymentsKeyBase}::pa_response_URL`]: paResponseURL
            },
            objectName: "myOrder",
            get: ["Payments"]
        };

        // Send request to external Order API (use same fetch pattern as routes/payments.js)
        const url = `${API_BASE || ''}${ORDER_PATH || '/app/WebAPI/v2/order'}`;
        const headers = {
            ...authHeaders(),
            "Content-Type": "application/json",
            "Accept": "application/json"
        };

        if (isDebugMode()) console.log('Forwarding 3DS to:', url, 'payload:', JSON.stringify(outboundBody));

        const resp = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(outboundBody),
            redirect: 'manual'
        });

        const respText = await resp.text();
        let respJson = null;
        try { respJson = JSON.parse(respText); } catch (e) { /* ignore, return text below */ }

        // Handle Set-Cookie merging
        const setCookie = resp.headers.get('set-cookie') || resp.headers.get('Set-Cookie');
        if (setCookie) {
            const newPairs = parseSetCookieHeader(setCookie);
            const merged = mergeCookiePairs(getCookies(), newPairs);
            setCookies(merged);
            // try to extract session cookie and update CURRENT_SESSION via setSession if present
            const sessionPair = newPairs.find(p => /^session=/i.test(p));
            if (sessionPair) {
                const sessionVal = sessionPair.split('=')[1];
                // update both session and cookies
                // reuse setSession import if available, else setCookies already updated
                if (typeof setCookies === 'function') {
                    // attempt to update using sessionStore.setSession if exported
                    try {
                        const { setSession } = await import('../utils/sessionStore.js');
                        setSession(sessionVal, merged);
                    } catch (e) {
                        // fallback: setCookies already done
                    }
                }
        }
        }

        if (!resp.ok) {
            return res.status(resp.status).json({ status: resp.status, body: respJson || respText });
        }

        // If initial update succeeded, perform the follow-up actions POST (insert notification correspondence)
        const actionsBody = {
            actions: [
                {
                    method: "insert",
                    params: { notification: "correspondence" },
                    acceptWarnings: [5008, 4224, 5388]
                }
            ],
            objectName: "myOrder"
        };

        if (isDebugMode()) console.log('Calling follow-up actions on order API:', url, JSON.stringify(actionsBody));

        const actionsResp = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(actionsBody),
            redirect: 'manual'
        });

        const actionsText = await actionsResp.text();
        let actionsJson = null;
        try { actionsJson = JSON.parse(actionsText); } catch (e) { /* ignore */ }

        // Merge any Set-Cookie from actions response
        const setCookie2 = actionsResp.headers.get('set-cookie') || actionsResp.headers.get('Set-Cookie');
        if (setCookie2) {
            const newPairs2 = parseSetCookieHeader(setCookie2);
            const merged2 = mergeCookiePairs(getCookies(), newPairs2);
            setCookies(merged2);
            try {
                const { setSession } = await import('../utils/sessionStore.js');
                const sessionPair2 = newPairs2.find(p => /^session=/i.test(p));
                if (sessionPair2) setSession(sessionPair2.split('=')[1], merged2);
            } catch (e) { /* ignore */ }
        }

        if (!actionsResp.ok) {
            return res.status(actionsResp.status).json({ status: actionsResp.status, body: actionsJson || actionsText });
        }

        // Build a redirect-style success response similar to /transaction
        // Try to extract an order number from the actionsResult or updateResult
        const orderNumber = (actionsJson?.data?.["Order::order_number"]?.standard) || (respJson?.data?.["Order::order_number"]?.standard) || null;

        const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

        if (isDebugMode()) console.log('3DS processing completed, returning redirect payload');

        return res.json({
            success: true,
            redirectUrl: `/viewOrder.html?orderId=${orderNumber || transactionId}&transactionId=${transactionId}`,
            transactionDetails: {
                success: true,
                transactionId,
                orderId: orderNumber || transactionId,
                timestamp: new Date().toISOString(),
                paymentMethod: "3DS",
                status: "completed",
                updateResult: respJson || respText,
                actionsResult: actionsJson || actionsText
            }
        });
    }
    catch (err) {
        if (isDebugMode()) console.log("Error in /processThreeDSResponse:", err.message);
        res.status(500).json({ error: String(err?.message || err) });
    }
});

export default router;