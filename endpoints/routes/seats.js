// routes/seats.js (refactored to use common helpers)
import express from "express";
import { ENDPOINTS } from "../../public/js/endpoints.js";
import { printDebugMessage } from "../utils/debug.js";
import { makeApiCallWithErrorHandling } from "../utils/common.js";
import { wrapRouteWithValidation } from "../utils/routeWrapper.js";

const router = express.Router();
const { ORDER: ORDER_PATH } = ENDPOINTS;

// POST /removeSeat -> Remove an admission by ID using manageAdmissions
router.post('/removeSeat', express.json(), wrapRouteWithValidation(
  async (req, res) => {
    const { admissionId } = req.body;
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

    const result = await makeApiCallWithErrorHandling(
      res, ORDER_PATH, payload, "Failed to remove admission"
    );
    if (!result) return; // Error already handled

    printDebugMessage('Seat removal successful');
    res.json({ success: true, response: result.data });
  },
  { params: ["admissionId"], paths: ["ORDER_PATH"], name: "removeSeat" }
));

export default router;