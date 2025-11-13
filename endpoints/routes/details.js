// endpoints/routes/details.js
import express from "express";
import { printDebugMessage } from "../utils/debug.js";
import { ENDPOINTS } from "../../public/endpoints.js";
import { validateCall, sendCall, handleSetCookies } from "../utils/common.js";

const { ORDER: ORDER_PATH } = ENDPOINTS;

const router = express.Router();

// GET /order -> Retrieve order details from AudienceView
router.get("/order", async (req, res) => {
  try {
    var expectedPaths = ["ORDER_PATH"];
    validateCall(req, [], expectedPaths, "order");

    /* Payload to get the Order and Admissions objects from the order */
    const payload = {
      get: ["Order", "Admissions"],
      objectName: "myOrder"
    };

    /* Send the call to AudienceView API*/    
    const response = await sendCall(ORDER_PATH, payload);
    handleSetCookies(response);

    const responseText = await response.text();

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = responseText;
    }

    if (!response.ok) {
      printDebugMessage(`Order details fetch failed: ${response.status}`);
      return res.status(response.status).json({
        error: "Failed to fetch order details",
        details: responseData
      });
    }

    // Extract order information from response
    const orderData = responseData?.data?.Order || {};

    printDebugMessage('Order details fetched successfully');

    res.json({
      success: true,
      order: orderData,
      rawResponse: responseData,
      admissions: responseData?.data?.Admissions || {}
    });

  } catch (err) {
    printDebugMessage(`Error in /order: ${err.message}`);
    res.status(500).json({ 
      error: String(err?.message || err) 
    });
  }
});

// GET /details -> Retrieve payment details from AudienceView
router.get("/details", async (req, res) => {
  try {
    var expectedPaths = ["ORDER_PATH"];
    validateCall(req, [], expectedPaths, "details");

    /* Payload to get the Payments object from the order */
    const payload = {
      get: ["Payments"],
      objectName: "myOrder"
    };

    /* Send the call to AudienceView API*/
    const r = await sendCall(ORDER_PATH, payload);

    const raw = await r.text();
    let data;
    try { data = JSON.parse(raw); } catch { 
      // Always return JSON, even if parsing fails
      printDebugMessage("Payment details fetch failed: Invalid JSON");
      return res.status(500).json({ error: "Invalid JSON from upstream", raw });
    }
    if (!r.ok) {
      printDebugMessage(`Payment details fetch failed: ${r.status}`);
      return res.status(r.status).json({ error: "Failed to fetch payment details", details: data });
    }

    printDebugMessage('Payment details fetched successfully');
    res.json({
      success: true,
      payments: data?.data?.Payments || {},
      rawResponse: data
    });

  } catch (err) {
    printDebugMessage(`Error in /details: ${err.message}`);
    res.status(500).json({
      error: String(err?.message || err)
    });
  }
});

export default router;
