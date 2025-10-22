// API helpers for checkout (exposed on window)

window.fetchCheckoutData = async function({ eventId, deliveryMethod, paymentMethod }) {
  const r = await fetch('/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ eventId, deliveryMethod, paymentMethod })
  });
  return r.json();
};

window.determineAdyenFlag = async function(paymentID) {
  if (!paymentID) return false;
  try {
    const paymentTypeResponse = await fetch('/getPaymentMethodType', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentID: paymentID })
    });
    const paymentTypeData = await paymentTypeResponse.json();
    if (paymentTypeData.success && paymentTypeData.paymentMethodType) {
      const paymentMethodType = paymentTypeData.paymentMethodType;
      const containsAdyen = Object.values(paymentMethodType).some(value => typeof value === 'string' && value.toLowerCase().includes('adyen'));
      window.adyen = containsAdyen;
    // Payment method type checked
      return containsAdyen;
    }
  } catch (error) {
    console.warn('Error checking payment method type:', error, 'defaulting adyen to false');
  }
  window.adyen = false;
  return false;
};

// call to getPaymentClientConfig
window.getPaymentConfiguration = async function() {
  try {
    const paymentMethodId = localStorage.getItem('paymentMethod') || '';
    const eventId = localStorage.getItem('eventId') || '';
    const response = await fetch('/getPaymentClientConfig', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentMethodId: paymentMethodId, eventId: eventId, paymentID: window.paymentID })
    });
    const serverConfig = await response.json();
  // Server payment config fetched
    return {
      environment: serverConfig.environment,
      clientKey: serverConfig.clientKey,
      countryCode: serverConfig.countryCode,
      currency: serverConfig.currency
    };
  } catch (error) {
    console.error('Failed to fetch payment client configuration from server:', error);
    throw error;
  }
};

// call to /order with get [ Payments::payment_id::payment_method_gateway_configuration ]
window.getPaymentResponse = async function() {
  try {
    const response = await fetch('/getPaymentResponse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paymentID: window.paymentID })
    });
    const paymentResponse = await response.json();
  // Payment response fetched
    return paymentResponse;
  } catch (error) {
    console.warn('Failed to fetch payment response from server:', error);
    return null;
  }
};


// This function will set the external_payment_data field and process the payment
// however, if the server returns the 4294 error code, it indicates that further action is needed (e.g., 3DS2 authentication).
// so it will call the dropin.handleAction method with the action data from the server response, stored in the pa_request_info field.
window.handleAdyenSubmit = async function(state, dropin) {
  // Adyen Drop-in onSubmit invoked
  try {
    const response = await fetch('/processAdyenPayment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ externalData: JSON.stringify(state.data), paymentID: window.paymentID })
    });
    const result = await response.json();
  // Payment processing result received
    if (result.success && result.redirectUrl) {
      window.location.href = result.redirectUrl;
    } else if (result.paRequestInfo) {
      if (typeof dropin.handleAction === 'function') {
        /*
          Will either
            - trigger 3DS2 flow within the Drop-in if Native 3DS2 data is provided
            - redirect to 3DS1 challenge if paRequestInfo contains a redirect URL
         */
        dropin.handleAction(result.paRequestInfo); // Pass action data to Drop-in for further handling
      } else {
        console.warn('dropin.handleAction not available');
      }
    } else {
      throw new Error(result.error || 'Payment failed');
    }
  } catch (error) {
    console.error('Payment submission error:', error);
    alert('Payment submission failed: ' + error.message);
  }
};
