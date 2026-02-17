import { ENDPOINTS } from '../../public/endpoints.js';
import { sendCall, validateCall, handleSetCookies, makeApiCallWithErrorHandling } from '../utils/common.js';
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

/**
 * Executes the multi-step checkout sequence:
 * 1. Add customer
 * 2. Check/add payment
 * 3. Set delivery method and payment details
 * 4. Get payment client token
 * 5. Get payment details
 * Returns payment details or null if error (response already sent)
 * @param {object} res - Express response object
 * @param {string} deliveryMethod - Delivery method ID
 * @param {string} paymentMethod - Payment method
 * @returns {Promise<{paymentID: string, payment_details: object} | null>}
 */
export async function executeCheckoutSequence(res, deliveryMethod, paymentMethod) {
  // Collect all backend API calls for frontend logging
  const backendApiCalls = [];

  // Step 1: Add customer
  const customerResult = await makeApiCallWithErrorHandling(
    res,
    ORDER_PATH,
    {
      actions: [{ method: "addCustomer", params: { "Customer::customer_number": "1" } }],
      get: ["Order::order_number", "Payments"],
      objectName: "myOrder"
    },
    "Checkout failed (addCustomer)"
  );
  if (!customerResult) return null;
  if (customerResult.apiCallMetadata) backendApiCalls.push(customerResult.apiCallMetadata);

  // Step 2: Check if payment exists
  const checkResult = await makeApiCallWithErrorHandling(
    res,
    ORDER_PATH,
    { get: ["Payments"], objectName: "myOrder" },
    "Checkout failed (check payments)"
  );
  if (!checkResult) return null;
  if (checkResult.apiCallMetadata) backendApiCalls.push(checkResult.apiCallMetadata);

  let paymentsObj = checkResult.data?.data?.Payments || {};
  let hasPayment = Object.values(paymentsObj).some(v => v?.payment_id?.standard);

  // Step 3: Add payment if needed
  if (!hasPayment) {
    const paymentResult = await makeApiCallWithErrorHandling(
      res,
      ORDER_PATH,
      { actions: [{ method: "addPayment" }], get: ["Payments"], objectName: "myOrder" },
      "Checkout failed (addPayment)"
    );
    if (!paymentResult) return null;
    if (paymentResult.apiCallMetadata) backendApiCalls.push(paymentResult.apiCallMetadata);
    paymentsObj = paymentResult.data?.data?.Payments || {};
  }

  // Extract paymentID
  let paymentID = null;
  for (const [k, v] of Object.entries(paymentsObj)) {
    if (k !== "state" && v?.payment_id?.standard) {
      paymentID = v.payment_id.standard;
      break;
    }
  }
  if (!paymentID) {
    printDebugMessage("No paymentID found after addPayment");
    res.status(500).json({ error: "No paymentID found after addPayment", details: paymentsObj, backendApiCalls });
    return null;
  }

  // Step 4: Set delivery method and payment details
  const setResult = await makeApiCallWithErrorHandling(
    res,
    ORDER_PATH,
    {
      set: {
        "Order::deliverymethod_id": deliveryMethod,
        [`Payments::${paymentID}::active_payment`]: paymentMethod,
        [`Payments::${paymentID}::swipe_indicator`]: "Internet",
        [`Payments::${paymentID}::cardholder_name`]: "Oliver Brito"
      },
      get: ["Order::order_number", "Payments"],
      objectName: "myOrder"
    },
    "Checkout failed (set delivery/payment)"
  );
  if (!setResult) return null;
  if (setResult.apiCallMetadata) backendApiCalls.push(setResult.apiCallMetadata);

  // Step 5: Get payment client token
  const tokenResult = await makeApiCallWithErrorHandling(
    res,
    ORDER_PATH,
    {
      actions: [{
        method: "getPaymentClientToken",
        params: { payment_id: paymentID, pa_response_URL: "https://localhost:3444/checkout.html" }
      }],
      get: ["Order::order_number", "Payments"],
      objectName: "myOrder"
    },
    "Checkout failed (getPaymentClientToken)"
  );
  if (!tokenResult) return null;
  if (tokenResult.apiCallMetadata) backendApiCalls.push(tokenResult.apiCallMetadata);

  // Step 6: Get payment details
  const detailsResult = await makeApiCallWithErrorHandling(
    res,
    ORDER_PATH,
    { get: [`Payments::${paymentID}`], objectName: "myOrder" },
    "Checkout failed (get payment details)"
  );
  if (!detailsResult) return null;
  if (detailsResult.apiCallMetadata) backendApiCalls.push(detailsResult.apiCallMetadata);

  return {
    paymentID,
    payment_details: detailsResult.data?.data?.[`Payments::${paymentID}`],
    backendApiCalls
  };
}
