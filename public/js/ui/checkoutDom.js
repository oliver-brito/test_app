// DOM-rendering helpers for the checkout page. Builds the summary panel and
// either the hosted-fields form or the Adyen Drop-in shell. The rendered
// HTML uses an inline onClick="handleSubmit(event)" handler, which is
// installed by flows/paymentFlow.js via window.handleSubmit.

import { HostedFieldsManager } from "../adyen/hostedFields.js";
import { renderAdyenDropIn } from "../adyen/adyenDropin.js";
import { getContext, getEventId } from "../shared/checkoutContext.js";

export function getCheckoutContext() {
  const ctx = getContext();
  return {
    deliveryMethod: ctx.deliveryMethod || "",
    paymentMethod: ctx.paymentMethod || "",
    eventId: getEventId(),
    resultDiv: document.getElementById("result"),
  };
}

export function allowOverrideFromHashMaybe(tokens) {
  if (!window.location.hash.includes("override")) return tokens;
  const overrideToken = prompt(
    "Override conversation token? Leave blank to use default.",
    tokens.conversationToken
  );
  if (overrideToken) tokens.conversationToken = overrideToken;
  const overridePaymentID = prompt(
    "Override paymentId? Leave blank to use default.",
    tokens.paymentId
  );
  if (overridePaymentID) {
    tokens.paymentId = overridePaymentID;
    window.paymentId = tokens.paymentId;
  }
  return tokens;
}

function renderSharedInfo(eventId, deliveryMethod, paymentMethod, pa_request_url, conversationToken, paymentId) {
  return `
    <div class="label">Event ID:</div><div class="value">${eventId}</div>
    <div class="label">Delivery Method:</div><div class="value">${deliveryMethod}</div>
    <div class="label">Payment Method:</div><div class="value">${paymentMethod}</div>
    <div class="label">PA Request URL:</div><div class="value"><a href="${pa_request_url}" target="_blank">${pa_request_url}</a></div>
    <div class="label">Conversation Token:</div><div class="value" id="conv-token-value">${conversationToken}</div>
    <div class="label">Payment ID:</div><div class="value" id="payment-id-value">${paymentId}</div>
    <button type="button" class="btn" id="change-info-btn" style="margin-bottom:16px; width:auto;">Change Info</button>
  `;
}

export function renderCheckoutInfo(resultDiv, adyenFlag, eventId, deliveryMethod, paymentMethod, pa_request_url, conversationToken, paymentId) {
  if (adyenFlag) {
    resultDiv.innerHTML = renderSharedInfo(eventId, deliveryMethod, paymentMethod, pa_request_url, conversationToken, paymentId);
    return;
  }
  resultDiv.innerHTML =
    renderSharedInfo(eventId, deliveryMethod, paymentMethod, pa_request_url, conversationToken, paymentId) +
    `
      <form id="payment-form" method="post" action="process_payment" style="margin-top:24px;">
        <h3>Payment Details</h3>
        <label for="account_number-container">Account Number:</label>
        <div id="account_number-container" class="hosted-field"></div>
        <label for="cvv-container">CVV:</label>
        <div id="cvv-container" class="hosted-field"></div>
        <label for="exp_date-container">Expiration Date:</label>
        <div id="exp_date-container" class="hosted-field"></div>
        <label for="cardholder_name-container">Cardholder Name:</label>
        <input
          type="text"
          name="BOset::BOorder::Payments::${paymentId}::cardholder_name"
          maxlength="100"
          class="input form-control"
          value=""
          title="Cardholder Name"
          id="BOset::BOorder::Payments::${paymentId}::cardholder_name"
          required
          autocomplete="cc-name">
        <button type="submit" class="btn" id="submit-button" onClick="handleSubmit(event)">Submit Payment</button>
      </form>
    `;
}

export function initHostedFields(conversationToken, pa_request_url, resultDiv) {
  const hostedFieldsManager = new HostedFieldsManager();
  window.currentHostedFieldsManager = hostedFieldsManager;
  hostedFieldsManager.initializeHostedFields({
    conversationToken,
    paRequestUrl: pa_request_url,
    resultContainer: resultDiv,
    onStatusUpdate: (fieldName, status, allStatuses) => {
      const allValid = Object.values(allStatuses).every((s) => s && s.isValid);
      if (allValid) console.log("All payment fields are now valid.");
    },
    onError: (error) => console.error("Hosted fields error:", error),
  });
}

export function wireChangeInfoButton(conversationTokenRef, paymentIdRef, resultDiv) {
  const el = document.getElementById("change-info-btn");
  if (!el) return;
  el.onclick = function () {
    const newToken = prompt(
      "Override conversation token? Leave blank to use current.",
      conversationTokenRef.value
    );
    if (newToken !== null && newToken !== "") conversationTokenRef.value = newToken;
    const newPaymentID = prompt("Override paymentId? Leave blank to use current.", paymentIdRef.value);
    if (newPaymentID !== null && newPaymentID !== "") {
      paymentIdRef.value = newPaymentID;
      window.paymentId = paymentIdRef.value;
    }
    const convEl = document.getElementById("conv-token-value");
    if (convEl) convEl.textContent = conversationTokenRef.value;
    const pidEl = document.getElementById("payment-id-value");
    if (pidEl) pidEl.textContent = paymentIdRef.value;
    renderCheckoutInfo(
      resultDiv,
      window.adyen,
      conversationTokenRef.eventId,
      conversationTokenRef.deliveryMethod,
      conversationTokenRef.paymentMethod,
      conversationTokenRef.pa_request_url,
      conversationTokenRef.value,
      paymentIdRef.value
    );
    if (window.adyen) renderAdyenDropIn(resultDiv);
    else initHostedFields(conversationTokenRef.value, conversationTokenRef.pa_request_url, resultDiv);
  };
}

// Window aliases used by the inline checkout.html bootstrap script.
window.getCheckoutContext = getCheckoutContext;
window.renderCheckoutInfo = renderCheckoutInfo;
window.initHostedFields = initHostedFields;
window.wireChangeInfoButton = wireChangeInfoButton;
window.allowOverrideFromHashMaybe = allowOverrideFromHashMaybe;
