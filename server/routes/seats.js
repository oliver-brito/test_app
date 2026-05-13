// server/routes/seats.js — seat-management endpoints.
import express from "express";
import { ENDPOINTS } from "../../public/js/endpoints.js";
import { printDebugMessage } from "../utils/debug.js";
import { callAvManaged } from "../services/avClient.js";
import { ACCEPTED_WARNINGS } from "../constants.js";
import { validate } from "../middleware/validate.js";
import { RemoveSeatBody } from "../schemas/seats.js";
import { MY_ORDER } from "../av/objectNames.js";
import { MANAGE_ADMISSIONS } from "../av/methods.js";
import {
  ORDER,
  ADMISSIONS,
  AVAILABLE_PAYMENT_METHODS,
  DELIVERY_METHOD_DETAILS,
} from "../av/fields.js";

const router = express.Router();
const { ORDER: ORDER_PATH } = ENDPOINTS;

router.post("/removeSeat", express.json(), validate(RemoveSeatBody), async (req, res) => {
  const { admissionId } = req.body;
  const payload = {
    actions: [
      {
        method: MANAGE_ADMISSIONS,
        params: { removeAdmissionID: [admissionId] },
        acceptWarnings: ACCEPTED_WARNINGS.REMOVE_ADMISSION,
      },
    ],
    get: [ORDER, ADMISSIONS, AVAILABLE_PAYMENT_METHODS, DELIVERY_METHOD_DETAILS, "Seats"],
    objectName: MY_ORDER,
  };

  const result = await callAvManaged(ORDER_PATH, payload, "Failed to remove admission");

  printDebugMessage("Seat removal successful");
  res.json({ success: true, response: result.data });
});

export default router;
