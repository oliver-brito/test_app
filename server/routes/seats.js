// server/routes/seats.js
import express from "express";
import { ENDPOINTS } from "../../public/js/endpoints.js";
import { printDebugMessage } from "../utils/debug.js";
import { makeApiCallWithErrorHandling } from "../utils/common.js";
import { ACCEPTED_WARNINGS } from "../constants.js";

const router = express.Router();
const { ORDER: ORDER_PATH } = ENDPOINTS;

// POST /removeSeat -> Remove an admission by ID using manageAdmissions
router.post("/removeSeat", express.json(), async (req, res) => {
  const { admissionId } = req.body;
  const payload = {
    actions: [
      {
        method: "manageAdmissions",
        params: { removeAdmissionID: [admissionId] },
        acceptWarnings: ACCEPTED_WARNINGS.REMOVE_ADMISSION,
      },
    ],
    get: ["Order", "Admissions", "AvailablePaymentMethods", "DeliveryMethodDetails", "Seats"],
    objectName: "myOrder",
  };

  const result = await makeApiCallWithErrorHandling(
    res, ORDER_PATH, payload, "Failed to remove admission"
  );
  if (!result) return;

  printDebugMessage("Seat removal successful");
  res.json({ success: true, response: result.data });
});

export default router;