// Checkout page entry. Imports side-effect modules (errorModal, debug
// console, navigation, hosted fields, details modal), and composes the
// checkout flow from the helper modules. All cross-page state lives in
// checkoutContext (sessionStorage) — no `window.X` globals.

import "../ui/errorModal.js";
import "../ui/apiDebugConsole.js";
import "../ui/navigation.js";
import "../shared/detailsModal.js";
import "../adyen/hostedFields.js";

import { checkAndRefreshAuth } from "../shared/auth.js";
import { fetchCheckoutData, determineAdyenFlag } from "../adyen/adyenApi.js";
import { renderAdyenDropIn, handleUrlParameters } from "../adyen/adyenDropin.js";
import { getContext, setContext } from "../shared/checkoutContext.js";
import {
  getCheckoutContext,
  allowOverrideFromHashMaybe,
  renderCheckoutInfo,
  initHostedFields,
  wireChangeInfoButton,
} from "../ui/checkoutDom.js";

async function doCheckout() {
  const { eventId, deliveryMethod, paymentMethod, resultDiv } = getCheckoutContext();

  try {
    const data = await fetchCheckoutData({ eventId, deliveryMethod, paymentMethod });
    const paymentDetails = data.payment_details || {};
    let pa_request_url = paymentDetails.pa_request_URL?.standard || "";
    let conversationToken = paymentDetails.server_to_client_token?.standard || "";
    let paymentId = paymentDetails.payment_id?.standard || "";
    setContext({ paymentId });
    await determineAdyenFlag(paymentId);

    const tokens = allowOverrideFromHashMaybe({ conversationToken, paymentId });
    conversationToken = tokens.conversationToken;
    paymentId = tokens.paymentId;

    const { isAdyenFlow } = getContext();
    renderCheckoutInfo(resultDiv, isAdyenFlow, eventId, deliveryMethod, paymentMethod, pa_request_url, conversationToken, paymentId);

    if (isAdyenFlow) {
      const adyenContainer = document.createElement("div");
      adyenContainer.id = "adyen-dropin-container";
      resultDiv.appendChild(adyenContainer);
      renderAdyenDropIn(resultDiv);
    } else {
      initHostedFields(conversationToken, pa_request_url, resultDiv);
    }

    wireChangeInfoButton(
      { value: conversationToken, eventId, deliveryMethod, paymentMethod, pa_request_url },
      { value: paymentId },
      resultDiv
    );
  } catch (err) {
    resultDiv.innerHTML = `<div class="error">Checkout failed: ${err.message}</div>`;
  }
}

async function doCheckoutReusePayment() {
  const { eventId, deliveryMethod, paymentMethod, resultDiv } = getCheckoutContext();
  const existingPaymentId = getContext().paymentId;
  if (!existingPaymentId) return doCheckout();

  resultDiv.innerHTML = '<div class="muted">Resuming payment session…</div>';
  try {
    setContext({ paymentId: existingPaymentId });
    await determineAdyenFlag(existingPaymentId);
    const { isAdyenFlow } = getContext();
    if (!isAdyenFlow) return doCheckout();
    renderCheckoutInfo(resultDiv, isAdyenFlow, eventId, deliveryMethod, paymentMethod, "", "", existingPaymentId);
    renderAdyenDropIn(resultDiv);
    wireChangeInfoButton(
      { value: "", eventId, deliveryMethod, paymentMethod, pa_request_url: "" },
      { value: existingPaymentId },
      resultDiv
    );
  } catch (err) {
    resultDiv.innerHTML = `<div class="error">Failed to resume payment session: ${err.message}</div>`;
  }
}

// Bootstrap.
(async function () {
  if (!(await checkAndRefreshAuth())) return;

  try {
    const storedPaymentId = getContext().paymentId;
    let result = handleUrlParameters(storedPaymentId);
    if (result && typeof result.then === "function") result = await result;

    const checkoutMode = new URLSearchParams(location.search).get("mode");
    const returningFromRedirect = !!window.location.search && !checkoutMode;
    const checkoutFn =
      checkoutMode === "reusePayment" || returningFromRedirect ? doCheckoutReusePayment : doCheckout;
    if (!(result && result.urlHandled)) checkoutFn();
  } catch (e) {
    console.error("Error handling URL parameters:", e);
    doCheckout();
  }
})();
