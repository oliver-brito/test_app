// DOM and rendering helpers for checkout (exposed on window)

window.getCheckoutContext = function() {
  return {
    deliveryMethod: localStorage.getItem('deliveryMethod') || '',
    paymentMethod: localStorage.getItem('paymentMethod') || '',
    eventId: localStorage.getItem('eventId') || '',
    resultDiv: document.getElementById('result')
  };
};


window.allowOverrideFromHashMaybe = function(tokens) {
  if (!window.location.hash.includes('override')) return tokens;
  const overrideToken = prompt('Override conversation token? Leave blank to use default.', tokens.conversationToken);
  if (overrideToken) tokens.conversationToken = overrideToken;
  const overridePaymentID = prompt('Override paymentID? Leave blank to use default.', tokens.paymentID);
  if (overridePaymentID) {
    tokens.paymentID = overridePaymentID;
    window.paymentID = tokens.paymentID;
  }
  return tokens;
};

window.renderSharedInfo = function(eventId, deliveryMethod, paymentMethod, pa_request_url, conversationToken, paymentID) {
  return `
            <div class="label">Event ID:</div><div class="value">${eventId}</div>
            <div class="label">Delivery Method:</div><div class="value">${deliveryMethod}</div>
            <div class="label">Payment Method:</div><div class="value">${paymentMethod}</div>
            <div class="label">PA Request URL:</div><div class="value"><a href="${pa_request_url}" target="_blank">${pa_request_url}</a></div>
            <div class="label">Conversation Token:</div><div class="value" id="conv-token-value">${conversationToken}</div>
            <div class="label">Payment ID:</div><div class="value" id="payment-id-value">${paymentID}</div>
            <button type="button" class="btn" id="change-info-btn" style="margin-bottom:16px; width:auto;">Change Info</button>
          `;
};

window.renderCheckoutInfo = function(resultDiv, adyenFlag, eventId, deliveryMethod, paymentMethod, pa_request_url, conversationToken, paymentID) {
  if (adyenFlag) {
    resultDiv.innerHTML = window.renderSharedInfo(eventId, deliveryMethod, paymentMethod, pa_request_url, conversationToken, paymentID);
  } else {
    resultDiv.innerHTML = window.renderSharedInfo(eventId, deliveryMethod, paymentMethod, pa_request_url, conversationToken, paymentID) + `
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
                  name="BOset::BOorder::Payments::${paymentID}::cardholder_name" 
                  maxlength="100" 
                  class="input form-control" 
                  value="" 
                  title="Cardholder Name" 
                  id="BOset::BOorder::Payments::${paymentID}::cardholder_name" 
                  required 
                  autocomplete="cc-name">
                <button type="submit" class="btn" id="submit-button" onClick="handleSubmit(event)">Submit Payment</button>
              </form>
            `;
  }
};

window.initHostedFields = function(conversationToken, pa_request_url, resultDiv) {
  if (window.HostedFieldsManager) {
    const hostedFieldsManager = new window.HostedFieldsManager();
    window.currentHostedFieldsManager = hostedFieldsManager;
    hostedFieldsManager.initializeHostedFields({
      conversationToken: conversationToken,
      paRequestUrl: pa_request_url,
      resultContainer: resultDiv,
      onStatusUpdate: (fieldName, status, allStatuses) => {
        console.log(`Field ${fieldName} status:`, status);
        console.log('All field statuses:', allStatuses);
        const allValid = Object.values(allStatuses).every(s => s && s.isValid);
        if (allValid) console.log('🎉 All payment fields are now valid!');
      },
      onError: (error) => { console.error('Hosted fields error:', error); }
    });
  } else {
    resultDiv.innerHTML += `<div class="error">Hosted fields module not loaded. Please refresh the page.</div>`;
  }
};

window.wireChangeInfoButton = function(conversationTokenRef, paymentIDRef, resultDiv) {
  const el = document.getElementById('change-info-btn');
  if (!el) return;
  el.onclick = function() {
    const newToken = prompt('Override conversation token? Leave blank to use current.', conversationTokenRef.value);
    if (newToken !== null && newToken !== '') conversationTokenRef.value = newToken;
    const newPaymentID = prompt('Override paymentID? Leave blank to use current.', paymentIDRef.value);
    if (newPaymentID !== null && newPaymentID !== '') { paymentIDRef.value = newPaymentID; window.paymentID = paymentIDRef.value; }
    const convEl = document.getElementById('conv-token-value'); if (convEl) convEl.textContent = conversationTokenRef.value;
    const pidEl = document.getElementById('payment-id-value'); if (pidEl) pidEl.textContent = paymentIDRef.value;
    // Re-init render based on new values
    window.renderCheckoutInfo(resultDiv, window.adyen, conversationTokenRef.eventId, conversationTokenRef.deliveryMethod, conversationTokenRef.paymentMethod, conversationTokenRef.pa_request_url, conversationTokenRef.value, paymentIDRef.value);
    if (window.adyen) window.renderAdyenDropIn(resultDiv); else window.initHostedFields(conversationTokenRef.value, conversationTokenRef.pa_request_url, resultDiv);
  };
};
