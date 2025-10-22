// Adyen-specific helpers (exposed on window)

// Render and mount the Adyen Drop-in into a container inside the provided resultDiv.
// Uses payment configuration/responses from the API helpers exposed on window.
window.renderAdyenDropIn = async function(resultDiv) {
  // Fetch client-side configuration and any payment methods payload from server
  const clientConfig = await window.getPaymentConfiguration();
  const paymentMethodsPayload = await window.getPaymentResponse();

  // Create a container for the Adyen Drop-in
  const dropinContainer = document.createElement('div');
  dropinContainer.id = 'adyen-dropin-container';
  dropinContainer.className = 'adyen-dropin';
  resultDiv.appendChild(dropinContainer);

  try {
    // Determine which payment methods to pass to the Adyen SDK
    let methodsResponse;
    if (paymentMethodsPayload && paymentMethodsPayload.success && paymentMethodsPayload.paymentMethodsResponse) {
      console.log('Using real payment methods from AudienceView:', paymentMethodsPayload.paymentMethodsResponse);
      methodsResponse = paymentMethodsPayload.paymentMethodsResponse;
    } else {
      console.warn('No payment response available, using fallback payment methods');
      methodsResponse = {
        paymentMethods: [
          { name: 'Credit Card', type: 'scheme' },
          { name: 'PayPal', type: 'paypal' }
        ]
      };
    }

    // Build Adyen configuration object
    const adyenConfiguration = {
      environment: clientConfig.environment,
      clientKey: clientConfig.clientKey,
      countryCode: clientConfig.countryCode,
      paymentMethodsResponse: methodsResponse,
      amount: {
        // Adyen expects amount in minor units (cents)
        value: Math.round(parseFloat(window.orderTotal || '0') * 100),
        currency: clientConfig.currency
      },
      onSubmit: (state, dropin) => { window.handleAdyenSubmit(state, dropin); },
      onAdditionalDetails: (state, dropin) => { window.handleAdyenSubmit(state, dropin);},
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

async function handleUrlParameters(paymentID) {
  // Get query string (after '?')
  const query = window.location.search.substring(1);
  if (!query) return { urlHandled: false };

  // Use extracted encoder to build UPS-style encoded string (length-prefixed)
  const encoded = encodePaResponseInformation(query);

  // Include the URL where the PA response was received so the server can
  // validate or log the source if needed.
  const paResponseUrl = window.location.href || "https://localhost:3443/checkout.html";

  // Build payload including paymentId (if available) and both PaRes/pa_response_information for compatibility
  const payload = {
    paymentId: paymentID ||window.paymentID || window.paymentId || null,
    PaRes: encoded,
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
 * Returns a length-prefixed string for each key and value: kkkkkeyvvvvalue
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
