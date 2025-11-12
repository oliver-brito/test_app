// routes/payments.js (refactored to use common helpers)
import express from "express";
import { ENDPOINTS } from "../../public/endpoints.js";
import { printDebugMessage } from "../utils/debug.js";
import { validateCall, sendCall, handleSetCookies } from "../utils/common.js";
import { insertOrder, redirectToViewOrder } from "./common.js";

const router = express.Router();
const { ORDER: ORDER_PATH } = ENDPOINTS; // Adyen-specific routes moved to adyen.js

// POST /transaction -> Process payment transaction via AudienceView API
router.post("/transaction", express.json(), async (req, res) => {
  try {
    validateCall(req, [], ["ORDER_PATH"], "transaction");

    const { orderData } = req.body || {};
    const response = await insertOrder();
    await handleSetCookies(response);
    
    const raw = await response.text();
    let data; try { data = JSON.parse(raw); } catch { data = raw; }

    if (!response.ok) {
      printDebugMessage(`Transaction failed: ${response.status}`);
      return res.status(response.status).json({ success: false, error: "Transaction failed", details: data });
    }

    const orderNumber = data?.data?.["Order::order_number"]?.standard;
    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

    var orderData = {
      orderNumber,
      transactionId,
      actionsJson: data,
      respJson: data,
      paymentMethod: "N/A"
    };
    printDebugMessage("Transaction completed successfully");
    return await redirectToViewOrder(orderData, res);

  } catch (err) {
    printDebugMessage(`Error in /transaction: ${err.message}`);
    res.status(500).json({ success: false, error: String(err?.message || err) });
  }
});


router.post("/checkout", express.json(), async (req, res) => {
  try {
    validateCall(req, ["deliveryMethod", "paymentMethod"], ["ORDER_PATH"], "checkout");
    const { deliveryMethod, paymentMethod } = req.body || {};

    // Step 1: addCustomer
    const addCustomerPayload = {
      actions: [{ method: "addCustomer", params: { "Customer::customer_number": "1" } }],
      get: ["Order::order_number", "Payments"],
      objectName: "myOrder"
    };
    const rCustomer = await sendCall(ORDER_PATH, addCustomerPayload);
    await handleSetCookies(rCustomer);
    const rawCustomer = await rCustomer.text();
    let dataCustomer; try { dataCustomer = JSON.parse(rawCustomer); } catch { dataCustomer = rawCustomer; }
    if (!rCustomer.ok) {
      printDebugMessage(`Checkout failed at addCustomer: ${rCustomer.status}`);
      return res.status(rCustomer.status).json({ error: "Checkout failed (addCustomer)", details: dataCustomer });
    }

    // Step 2: check Payments
    const checkPaymentsPayload = { get: ["Payments"], objectName: "myOrder" };
    const rCheck = await sendCall(ORDER_PATH, checkPaymentsPayload);
    await handleSetCookies(rCheck);
    const rawCheck = await rCheck.text();
    let dataCheck; try { dataCheck = JSON.parse(rawCheck); } catch { dataCheck = rawCheck; }
    let paymentsObj = dataCheck?.data?.Payments || {};
    let hasPayment = Object.values(paymentsObj).some(v => v?.payment_id?.standard);

    let dataPayment;
    if (!hasPayment) {
      const addPaymentPayload = { actions: [{ method: "addPayment" }], get: ["Payments"], objectName: "myOrder" };
      const rPayment = await sendCall(ORDER_PATH, addPaymentPayload);
      await handleSetCookies(rPayment);
      const rawPayment = await rPayment.text();
      try { dataPayment = JSON.parse(rawPayment); } catch { dataPayment = rawPayment; }
      if (!rPayment.ok) {
        printDebugMessage(`Checkout failed at addPayment: ${rPayment.status}`);
        return res.status(rPayment.status).json({ error: "Checkout failed (addPayment)", details: dataPayment });
      }
      paymentsObj = dataPayment?.data?.Payments || {};
    } else {
      dataPayment = dataCheck;
    }

    // Extract paymentID
    let paymentID = null;
    for (const [k, v] of Object.entries(paymentsObj)) {
      if (k !== "state" && v?.payment_id?.standard) { paymentID = v.payment_id.standard; break; }
    }
    if (!paymentID) {
      return res.status(500).json({ error: "No paymentID found after addPayment", details: paymentsObj });
    }

    // Step 3: set delivery & payment
    const setPayload = {
      set: {
        "Order::deliverymethod_id": deliveryMethod,
        [`Payments::${paymentID}::active_payment`]: paymentMethod,
        [`Payments::${paymentID}::swipe_indicator`]: "Internet",
        [`Payments::${paymentID}::cardholder_name`]: "Oliver Brito"
      },
      get: ["Order::order_number", "Payments"],
      objectName: "myOrder"
    };
    const rSet = await sendCall(ORDER_PATH, setPayload);
    await handleSetCookies(rSet);
    const rawSet = await rSet.text();
    let dataSet; try { dataSet = JSON.parse(rawSet); } catch { dataSet = rawSet; }
    if (!rSet.ok) {
      printDebugMessage(`Checkout failed at set delivery/payment: ${rSet.status}`);
      return res.status(rSet.status).json({ error: "Checkout failed (set delivery/payment)", details: dataSet });
    }

    // Step 4: getPaymentClientToken
    const tokenPayload = {
      actions: [{ method: "getPaymentClientToken", params: { payment_id: paymentID, pa_response_URL: "https://localhost:3444/checkout.html" } }],
      get: ["Order::order_number", "Payments"],
      objectName: "myOrder"
    };
    const rToken = await sendCall(ORDER_PATH, tokenPayload);
    await handleSetCookies(rToken);
    const rawToken = await rToken.text();
    let dataToken; try { dataToken = JSON.parse(rawToken); } catch { dataToken = rawToken; }

    // Step 5: get Payments::paymentID details
    const paymentDetailsPayload = { get: [`Payments::${paymentID}`], objectName: "myOrder" };
    const rDetails = await sendCall(ORDER_PATH, paymentDetailsPayload);
    await handleSetCookies(rDetails);
    const rawDetails = await rDetails.text();
    let dataDetails; try { dataDetails = JSON.parse(rawDetails); } catch { dataDetails = rawDetails; }
    printDebugMessage("Checkout completed successfully");
    res.json({ payment_details: dataDetails.data?.[`Payments::${paymentID}`], paymentID });
  } catch (err) {
    printDebugMessage(`Error in /checkout: ${err.message}`);
    res.status(500).json({ error: String(err?.message || err) });
  }
});


export default router;