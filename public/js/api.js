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
      environment: serverConfig.environment || 'test',
      clientKey: serverConfig.clientKey || 'test_7REK4YQWRZB2DPRS7RNTFTGX2MPKY4SQ',
      countryCode: serverConfig.countryCode || 'US',
      currency: serverConfig.currency || 'USD'
    };
  } catch (error) {
    console.warn('Failed to fetch payment config from server, using defaults:', error);
    return { environment: 'test', clientKey: 'test_7REK4YQWRZB2DPRS7RNTFTGX2MPKY4SQ', countryCode: 'US', currency: 'USD' };
  }
};

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

// handleAdyenSubmit remains an API-facing function but can call processAdyenThreeDS on window
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
        console.log('3DS Action Info:', JSON.stringify(result.paRequestInfo));
        dropin.handleAction(result.paRequestInfo);
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
