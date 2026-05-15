// server/routes/seats.js — seat-management endpoints.
import express from "express";
import { ENDPOINTS } from "../../public/js/endpoints.js";
import { printDebugMessage } from "../utils/debug.js";
import { av } from "../services/av.js";
import { ACCEPTED_WARNINGS } from "../constants.js";
import { handler } from "../middleware/handler.js";
import { RemoveSeatBody } from "../schemas/seats.js";
import { MY_ORDER } from "../av/objectNames.js";
import { MANAGE_ADMISSIONS } from "../av/methods.js";
import {
  ORDER,
  ADMISSIONS,
  AVAILABLE_PAYMENT_METHODS,
  DELIVERY_METHOD_DETAILS,
  SEATS,
} from "../av/fields.js";

const router = express.Router();
const { ORDER: ORDER_PATH } = ENDPOINTS;

const removeSeat = handler({
  body: RemoveSeatBody,
  async run({ admissionId }) {
    const { data } = await av
      .on(MY_ORDER)
      .action(
        MANAGE_ADMISSIONS,
        { removeAdmissionID: [admissionId] },
        { acceptWarnings: ACCEPTED_WARNINGS.REMOVE_ADMISSION }
      )
      .get(ORDER, ADMISSIONS, AVAILABLE_PAYMENT_METHODS, DELIVERY_METHOD_DETAILS, SEATS)
      .post(ORDER_PATH)
      .orFail("Failed to remove admission");

    printDebugMessage("Seat removal successful");
    return { success: true, response: data };
  },
});

router.post("/removeSeat", removeSeat);

export default router;
