// Checkout page entry. Imports side-effect modules (errorModal, debug
// console, navigation, hosted fields, details modal), the API/auth/checkout
// helpers, and exposes doCheckout/doCheckoutReusePayment for the inline
// bootstrap script in checkout.html.

import "../ui/errorModal.js";
import "../ui/apiDebugConsole.js";
import "../ui/navigation.js";
import "../shared/detailsModal.js";
import "../adyen/hostedFields.js";
import "../flows/paymentFlow.js";

import { checkAndRefreshAuth } from "../shared/auth.js";
import { fetchCheckoutData, determineAdyenFlag } from "../adyen/adyenApi.js";
import { renderAdyenDropIn, handleUrlParameters } from "../adyen/adyenDropin.js";
import {
  getCheckoutContext,
  allowOverrideFromHashMaybe,
  renderCheckoutInfo,
  initHostedFields,
  wireChangeInfoButton,
} from "../ui/checkoutDom.js";

async function doCheckout() {
  const ctx = getCheckoutContext();
  const { eventId, deliveryMethod, paymentMethod, resultDiv } = ctx;

  try {
    const data = await fetchCheckoutData({ eventId, deliveryMethod, paymentMethod });
    const payment_details = data.payment_details || {};
    let pa_request_url = payment_details.pa_request_URL?.standard || "";
    let conversationToken = payment_details.server_to_client_token?.standard || "";
    let paymentID = payment_details.payment_id?.standard || "";
    window.paymentID = paymentID;
    localStorage.setItem("paymentID", paymentID);
    await determineAdyenFlag(paymentID);

    const tokens = allowOverrideFromHashMaybe({ conversationToken, paymentID });
    conversationToken = tokens.conversationToken;
    paymentID = tokens.paymentID;

    renderCheckoutInfo(
      resultDiv,
      window.adyen,
      eventId,
      deliveryMethod,
      paymentMethod,
      pa_request_url,
      conversationToken,
      paymentID
    );

    if (window.adyen) {
      const adyenContainer = document.createElement("div");
      adyenContainer.id = "adyen-dropin-container";
      resultDiv.appendChild(adyenContainer);
      renderAdyenDropIn(resultDiv);
    } else {
      initHostedFields(conversationToken, pa_request_url, resultDiv);
    }

    const convRef = { value: conversationToken, eventId, deliveryMethod, paymentMethod, pa_request_url };
    const pidRef = { value: paymentID };
    wireChangeInfoButton(convRef, pidRef, resultDiv);
  } catch (err) {
    resultDiv.innerHTML = `<div class="error">Checkout failed: ${err.message}</div>`;
  }
}

async function doCheckoutReusePayment() {
  const ctx = getCheckoutContext();
  const { eventId, deliveryMethod, paymentMethod, resultDiv } = ctx;
  const existingPaymentID = localStorage.getItem("paymentID");

  if (!existingPaymentID) return doCheckout();

  resultDiv.innerHTML = '<div class="muted">Resuming payment session…</div>';
  try {
    window.paymentID = existingPaymentID;
    await determineAdyenFlag(existingPaymentID);
    if (!window.adyen) return doCheckout();
    renderCheckoutInfo(resultDiv, window.adyen, eventId, deliveryMethod, paymentMethod, "", "", existingPaymentID);
    renderAdyenDropIn(resultDiv);
    const convRef = { value: "", eventId, deliveryMethod, paymentMethod, pa_request_url: "" };
    const pidRef = { value: existingPaymentID };
    wireChangeInfoButton(convRef, pidRef, resultDiv);
  } catch (err) {
    resultDiv.innerHTML = `<div class="error">Failed to resume payment session: ${err.message}</div>`;
  }
}

window.doCheckout = doCheckout;
window.doCheckoutReusePayment = doCheckoutReusePayment;

// Bootstrap (was an inline <script> in checkout.html).
(async function () {
  if (!(await checkAndRefreshAuth())) return;

  try {
    const localStoragePaymentID = localStorage.getItem("paymentID");
    let result = handleUrlParameters(localStoragePaymentID);
    if (result && typeof result.then === "function") result = await result;

    const checkoutMode = new URLSearchParams(location.search).get("mode");
    const returningFromRedirect = !!window.location.search && !checkoutMode;
    const checkoutFn =
      (checkoutMode === "reusePayment" || returningFromRedirect)
        ? doCheckoutReusePayment
        : doCheckout;
    if (!(result && result.urlHandled)) checkoutFn();
  } catch (e) {
    console.error("Error handling URL parameters:", e);
    doCheckout();
  }
})();
