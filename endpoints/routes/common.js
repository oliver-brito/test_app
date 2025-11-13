import { ENDPOINTS } from '../../public/endpoints.js';
import { sendCall, validateCall, handleSetCookies } from '../utils/common.js';
import { printDebugMessage } from '../utils/debug.js';

const { ORDER: ORDER_PATH } = ENDPOINTS;

export async function insertOrder() {
    validateCall({}, [], [], "insertOrder");
    const actionsBody = {
        actions: [
            {
                method: "insert",
                params: { notification: "correspondence" },
                acceptWarnings: [5008, 4224, 5388]
            }
        ],
        objectName: "myOrder",
        get: ["Order", "Admissions", "Payments", "Order::order_number"]
    };

    
    const resp = await sendCall(ORDER_PATH, actionsBody, true);
    return resp;
}

export async function redirectToViewOrder(orderData, res){
    const { orderNumber, transactionId, actionsJson, respJson, paymentMethod } = orderData;
    return res.json({
        success: true,
        redirectUrl: `/viewOrder.html?orderId=${orderNumber || transactionId}&transactionId=${transactionId}`,
        transactionDetails: {
            success: true,
            transactionId,
            orderId: orderNumber || transactionId,
            timestamp: new Date().toISOString(),
            paymentMethod: paymentMethod || "N/A",
            status: "completed",
            updateResult: respJson,
            actionsResult: actionsJson
        }
    });
}

export async function handleThreeDS(req, res, { paymentID } = {}) {
  try {
    validateCall(req, [], ["ORDER_PATH"], "handleThreeDS");
    const payload = { 
      get: [
        `Payments::${paymentID}::pa_request_information`, 
        `Payments::${paymentID}::pa_request_URL`
      ], 
      objectName: 'myOrder' 
    };
    const r = await sendCall(ORDER_PATH, payload);
    await handleSetCookies(r);
    const text = await r.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    const paObj = data?.data?.[`Payments::${paymentID}::pa_request_information`];
    let paJsonStr = paObj?.standard || paObj?.input || paObj?.display || null;
    let paInfo = null;
    let paURL = null;
    if (paJsonStr) {
      try { paInfo = JSON.parse(paJsonStr); } catch { try { paInfo = JSON.parse(JSON.parse(paJsonStr)); } catch { paInfo = paJsonStr; } }
      paURL = data?.data?.[`Payments::${paymentID}::pa_request_URL`];
    }
    return res.status(402).json(
      { 
        success: false, 
        error: '3ds required', 
        code: 4294, 
        paymentID, 
        paRequestInfo: paInfo,
        paRequestURL: paURL,
        rawResponse: data 
      }
    );
  } catch (err) {
    printDebugMessage(`Error in handleThreeDS: ${err.message}`);
    return res.status(500).json({ success: false, error: 'handleThreeDS error', details: String(err?.message || err) });
  }
}
