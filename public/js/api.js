// API helpers for checkout (exposed on window)

window.fetchCheckoutData = async function({ eventId, deliveryMethod, paymentMethod }) {
  // Use the new API wrapper for automatic error modal display
  return await window.apiCall('/checkout', {
    body: { eventId, deliveryMethod, paymentMethod }
  });
};

window.determineAdyenFlag = async function(paymentID) {
  if (!paymentID) return false;
  try {
    const paymentTypeData = await window.apiCall('/getPaymentMethodType', {
      body: { paymentID: paymentID }
    });
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
    const serverConfig = await window.apiCall('/getPaymentClientConfig', {
      body: { paymentMethodId: paymentMethodId, eventId: eventId, paymentID: window.paymentID }
    });
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
    const paymentResponse = await window.apiCall('/getPaymentResponse', {
      body: { paymentID: window.paymentID }
    });
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
    // Use the new API wrapper for automatic error modal display
    const result = await window.apiCall('/processAdyenPayment', {
      body: { externalData: JSON.stringify(state.data), paymentID: window.paymentID }
    });
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
    // Error modal already shown by apiCall wrapper if it was an API error
    if (!error.message.includes('Payment failed')) {
      alert('Payment submission failed: ' + error.message);
    }
  }
};
