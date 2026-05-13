import { ENDPOINTS } from "../../public/js/endpoints.js";
import { sendCall, handleSetCookies, parseResponse } from "../utils/common.js";
import { printDebugMessage } from "../utils/debug.js";
import { EXCEPTION_CODES } from "../constants.js";

const { ORDER: ORDER_PATH } = ENDPOINTS;

function parsePaRequestInfo(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    // av-avon occasionally double-encodes the JSON.
    try {
      return JSON.parse(JSON.parse(raw));
    } catch {
      return raw;
    }
  }
}

/**
 * Issue a 402 response containing the 3DS challenge inputs (pa_request_information
 * + pa_request_URL) the browser-side flow needs to launch the Cardinal iframe.
 */
export async function handleThreeDS(req, res, { paymentId } = {}) {
  try {
    const payload = {
      get: [
        `Payments::${paymentId}::pa_request_information`,
        `Payments::${paymentId}::pa_request_URL`,
      ],
      objectName: "myOrder",
    };

    const response = await sendCall(ORDER_PATH, payload);
    await handleSetCookies(response);
    const data = await parseResponse(response);

    const paObj = data?.data?.[`Payments::${paymentId}::pa_request_information`];
    const paJsonStr = paObj?.standard || paObj?.input || paObj?.display || null;

    const paInfo = paJsonStr ? parsePaRequestInfo(paJsonStr) : null;
    const paURL = paJsonStr ? data?.data?.[`Payments::${paymentId}::pa_request_URL`] : null;

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
