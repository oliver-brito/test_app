// Issues the 3DS challenge to the browser when av-avon signals 4294
// "3DS required" on an order insert.

import { ENDPOINTS } from "../../public/js/endpoints.js";
import { av } from "./av.js";
import { printDebugMessage } from "../utils/debug.js";
import { EXCEPTION_CODES } from "../constants.js";
import { MY_ORDER } from "../av/objectNames.js";
import { paymentField, PAYMENT_FIELDS } from "../av/fields.js";

const { ORDER: ORDER_PATH } = ENDPOINTS;

/** av-avon occasionally double-encodes the JSON; try once, fall back to twice. */
function parsePaRequestInfo(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    try {
      return JSON.parse(JSON.parse(raw));
    } catch {
      return raw;
    }
  }
}

/**
 * Respond with a 402 body containing the 3DS challenge inputs
 * (pa_request_information + pa_request_URL) the browser-side flow needs to
 * mount the Cardinal iframe.
 */
export async function handleThreeDS(req, res, { paymentId } = {}) {
  const paRequestInfoField = paymentField(paymentId, PAYMENT_FIELDS.PA_REQUEST_INFORMATION);
  const paRequestUrlField = paymentField(paymentId, PAYMENT_FIELDS.PA_REQUEST_URL);

  try {
    const { data } = await av
      .on(MY_ORDER)
      .get(paRequestInfoField, paRequestUrlField)
      .post(ORDER_PATH);

    const paObj = data?.data?.[paRequestInfoField];
    const paJsonStr = paObj?.standard || paObj?.input || paObj?.display || null;
    const paInfo = paJsonStr ? parsePaRequestInfo(paJsonStr) : null;
    const paURL = paJsonStr ? data?.data?.[paRequestUrlField] : null;

    return res.status(402).json({
      success: false,
      error: "3ds required",
      code: EXCEPTION_CODES.THREE_DS_REQUIRED,
      paymentId,
      paRequestInfo: paInfo,
      paRequestURL: paURL,
      rawResponse: data,
    });
  } catch (err) {
    printDebugMessage(`Error in handleThreeDS: ${err.message}`);
    return res.status(500).json({
      success: false,
      error: "handleThreeDS error",
      details: String(err?.message || err),
    });
  }
}
