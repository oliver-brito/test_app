// Adyen-specific helpers (exposed on window)

// Render and mount the Adyen Drop-in into a container inside the provided resultDiv.
// Uses payment configuration/responses from the API helpers exposed on window.
window.renderAdyenDropIn = async function(resultDiv) {
  // Fetch client-side configuration and any payment methods payload from server
  const clientConfig = await window.getPaymentConfiguration(); // call to getPaymentClientConfig
  const paymentMethodsPayload = await window.getPaymentResponse(); // call to /order with get [ Payments::payment_id::payment_method_gateway_configuration ]

  // Create a container for the Adyen Drop-in
    const dropinContainer = document.createElement('div');
    dropinContainer.id = 'adyen-dropin-container';
    dropinContainer.className = 'adyen-dropin';
    resultDiv.appendChild(dropinContainer);

  try {
    // Determine which payment methods to pass to the Adyen SDK
    let methodsResponse;
    if (paymentMethodsPayload && paymentMethodsPayload.success && paymentMethodsPayload.paymentMethodsResponse) {
      methodsResponse = paymentMethodsPayload.paymentMethodsResponse;
    } else {
      throw new Error('Invalid or missing payment methods response from server');
    }

    // Build Adyen configuration object
    const adyenConfiguration = {
      environment: clientConfig.environment, // test or live. Can be retrieved from the getPaymentClientConfig call under the name adyen_env
      clientKey: clientConfig.clientKey, // public client key from getPaymentClientConfig, under the name adyen_client_key
      countryCode: clientConfig.countryCode, // can be retrieved from customer's billing address if needed
      paymentMethodsResponse: methodsResponse, // the paymentmethod_gateway_configuration field
      amount: {
        // Adyen expects amount in minor units (cents)
        value: Math.round(parseFloat(window.orderTotal || '0') * 100),
        currency: clientConfig.currency
      },
      onSubmit: (state, dropin) => { window.handleAdyenSubmit(state, dropin); }, // should set the external_payment_data field
      onAdditionalDetails: (state, dropin) => { window.handleAdyenSubmit(state, dropin);}, // should set the external_payment_data field, for Native 3DS2 flows
      onError: (err, dropin) => { console.error('Adyen Drop-in error:', err); alert('Payment error: ' + err.message); },
      onLoad: (state, dropin) => { console.log('Adyen Drop-in loaded'); }
    };

    // Initialize Adyen Checkout and Drop-in
    const { AdyenCheckout, Dropin } = window.AdyenWeb;
    window.adyenCheckout = await AdyenCheckout(adyenConfiguration);
    const adyenCheckoutInstance = window.adyenCheckout;

    const dropinOptions = {
      paymentMethodsConfiguration: {
        card: {
          hasHolderName: true,
          holderNameRequired: true,
          billingAddressRequired: true
        }
      }
    };

    // Store dropin globally for debugging/control and mount it
    window.adyenDropin = new Dropin(adyenCheckoutInstance, dropinOptions);
    window.adyenDropin.mount('#' + dropinContainer.id);

  } catch (initError) {
    console.error('Error initializing Adyen Drop-in:', initError);
    resultDiv.innerHTML += `<div class="error">Error initializing Adyen Drop-in: ${initError.message}</div>`;
  }
};


/*
  * Handle URL parameters returned from Adyen 3DS authentication redirect.
      When the redirect is back from the challenge page, Adyen appends query parameters to the URL.
      This function encodes those parameters (as UPS expects them to be) and sends them to the server
*/
async function handleUrlParameters(paymentID) {
  // Get query string (after '?')
  const query = window.location.search.substring(1);
  if (!query) return { urlHandled: false };

  // Use extracted encoder to build UPS-style encoded string (length-prefixed)
  const encoded = encodePaResponseInformation(query);

  // Include the URL where the PA response was received so the server can
  // validate or log the source if needed.
  const paResponseUrl = window.location.href || "https://localhost:3444/checkout.html";

  // Build payload including paymentId (if available) and both PaRes/pa_response_information for compatibility
  const payload = {
    paymentId: paymentID ||window.paymentID || window.paymentId || null,
    pa_response_information: encoded,
    pa_response_URL: paResponseUrl
  };

  // Send a single JSON POST and await the response so we don't duplicate requests
  try {
    const resp = await fetch("/processThreeDSResponse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    let resultText = await resp.text();
    let result = null;
    try { result = JSON.parse(resultText); } catch (e) { result = resultText; }

    if (resp.ok && result && result.success && result.redirectUrl) {
      setTimeout(() => { window.location.href = result.redirectUrl; }, 1500);
    } else {
      const errMsg = (result && result.error) ? result.error : (typeof result === 'string' ? result : 'Transaction failed');
      throw new Error(errMsg);
    }
  } catch (e) {
    console.error("❌ Error sending PaRes (JSON):", e);
  }

  return { urlHandled: true };
}

/**
 * Encode a query string (either with or without a leading '?') into the
 * UPS-style PaRes information string. Example input: "PaRes=<value>&MD=<v>"
 * @param {string} query - The query string to encode
 * @returns {string} The encoded PaRes information string
 * 
 * An example encoding for "PaRes=abc&MD=123" would be:
 * 00005PaRes00003abc00002MD00003123
 * So, is 5 characters for key length, then key, then 5 characters for value length, then value, etc.
 */
function encodePaResponseInformation(query) {
  if (!query) return "";
  // strip leading '?' if present
  const q = query.startsWith('?') ? query.substring(1) : query;

  return q.split('&').map(pair => {
    const [key, rawValue = ''] = pair.split('=', 2);
    const value = decodeURIComponent(rawValue);
    const klen = key.length.toString().padStart(5, '0');
    const vlen = value.length.toString().padStart(5, '0');
    return `${klen}${key}${vlen}${value}`;
  }).join('');
}
