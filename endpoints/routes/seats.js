// routes/seats.js (refactored to use common helpers)
import express from "express";
import { ENDPOINTS } from "../../public/endpoints.js";
import { printDebugMessage } from "../utils/debug.js";
import { validateCall, sendCall, handleSetCookies } from "../utils/common.js";

const router = express.Router();
const { ORDER: ORDER_PATH } = ENDPOINTS;

// POST /removeSeat -> Remove an admission by ID using manageAdmissions
router.post('/removeSeat', express.json(), async (req, res) => {
  try {
    // admissionId required
    validateCall(req, ["admissionId"], ["ORDER_PATH"], "removeSeat");
    const { admissionId } = req.body || {};
    const payload = {
      actions: [
        {
          method: "manageAdmissions",
          params: { removeAdmissionID: [admissionId] },
          acceptWarnings: [5414]
        }
      ],
      get: ["Order", "Admissions", "AvailablePaymentMethods", "DeliveryMethodDetails", "Seats"],
      objectName: "myOrder"
    };

    const response = await sendCall(ORDER_PATH, payload);
    await handleSetCookies(response);
    const raw = await response.text();
    let data; try { data = JSON.parse(raw); } catch { data = raw; }
    if (!response.ok) {
      printDebugMessage(`Seat removal failed: ${response.status}`);
      return res.status(response.status).json({ error: "Failed to remove admission", details: data });
    }
    printDebugMessage('Seat removal successful');
    res.json({ success: true, response: data });
  } catch (err) {
    printDebugMessage(`Error in /removeSeat: ${err.message}`);
    res.status(500).json({ error: String(err?.message || err) });
  }
});

export default router;