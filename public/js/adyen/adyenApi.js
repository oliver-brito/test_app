// Adyen-specific API helpers used by the checkout flow.

import { apiCall } from "../shared/api.js";
import { getContext, getEventId } from "../shared/checkoutContext.js";

export async function fetchCheckoutData({ eventId, deliveryMethod, paymentMethod }) {
  return apiCall("/checkout", {
    body: { eventId, deliveryMethod, paymentMethod },
  });
}

export async function determineAdyenFlag(paymentID) {
  if (!paymentID) {
    window.adyen = false;
    return false;
  }
  try {
    const paymentTypeData = await apiCall("/getPaymentMethodType", {
      body: { paymentID },
    });
    if (paymentTypeData.success && paymentTypeData.paymentMethodType) {
      const containsAdyen = Object.values(paymentTypeData.paymentMethodType).some(
        (value) => typeof value === "string" && value.toLowerCase().includes("adyen")
      );
      window.adyen = containsAdyen;
      return containsAdyen;
    }
  } catch (error) {
    console.warn("Error checking payment method type:", error, "defaulting adyen to false");
  }
  window.adyen = false;
  return false;
}

export async function getPaymentConfiguration() {
  const { paymentMethod = "" } = getContext();
  const serverConfig = await apiCall("/getPaymentClientConfig", {
    body: { paymentMethodId: paymentMethod, eventId: getEventId(), paymentID: window.paymentID },
  });
  return {
    environment: serverConfig.environment,
    clientKey: serverConfig.clientKey,
    countryCode: serverConfig.countryCode,
    currency: serverConfig.currency,
  };
}

export async function getPaymentResponse() {
  try {
    return await apiCall("/getPaymentResponse", {
      body: { paymentID: window.paymentID },
    });
  } catch (error) {
    console.warn("Failed to fetch payment response from server:", error);
    return null;
  }
}

/**
 * Adyen Drop-in onSubmit / onAdditionalDetails handler. Calls
 * /processAdyenPayment; on a 4294 (3DS required) response, forwards the
 * action payload back to the Drop-in so it can launch the challenge.
 */
export async function handleAdyenSubmit(state, dropin) {
  try {
    const resetEnabled = localStorage.getItem("resetPaymentAttemptEnabled") === "true";
    const result = await apiCall("/processAdyenPayment", {
      body: {
        externalData: JSON.stringify(state.data),
        paymentID: window.paymentID,
        ...(resetEnabled ? { resetPaymentAttempt: true } : {}),
      },
      showErrorModal: false,
    });

    if (result.success && result.redirectUrl) {
      window.location.href = result.redirectUrl;
    } else if (result.paRequestInfo) {
      if (typeof dropin.handleAction === "function") {
        dropin.handleAction(result.paRequestInfo);
      } else {
        console.warn("dropin.handleAction not available");
      }
    } else if (result.cancelled) {
      dropin.setStatus("error", { message: result.error || "Payment was cancelled." });
      const eventId = getEventId();
      if (eventId) {
        setTimeout(() => {
          window.location.href = `event.html?id=${encodeURIComponent(eventId)}&cancelled=true`;
        }, 1000);
      }
    } else {
      dropin.setStatus("ready");
      if (typeof window.showApiError === "function") {
        window.showApiError({
          endpoint: "/processAdyenPayment",
          error: result.error || "Payment failed",
          status: result.status || 400,
          request: { body: { paymentID: window.paymentID } },
          response: result,
        });
      }
    }
  } catch (error) {
    console.error("Payment submission error:", error);
    dropin.setStatus("error", { message: error.message || "Payment submission failed." });
  }
}

// Window aliases for legacy access from non-module code paths.
window.fetchCheckoutData = fetchCheckoutData;
window.determineAdyenFlag = determineAdyenFlag;
window.getPaymentConfiguration = getPaymentConfiguration;
window.getPaymentResponse = getPaymentResponse;
window.handleAdyenSubmit = handleAdyenSubmit;
