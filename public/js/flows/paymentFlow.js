// Hosted-fields payment flow. The submit handler is wired by
// ui/checkoutDom.js via form.addEventListener("submit", handleSubmit).
// Splits responsibilities across three modules — this file is just the
// orchestration.

import { apiCall } from "../shared/api.js";
import { setSubmitting, showError, showSuccess, mountProcessButton } from "../ui/submitUI.js";
import { launch3DSChallenge } from "./threeDS.js";
import { getContext, getEventId } from "../shared/checkoutContext.js";

/**
 * Submit the hosted-fields group via the Av SDK, then mount a "process
 * transaction" button that POSTs the result to /transaction.
 */
export function handleSubmit(event) {
  event.preventDefault();
  setSubmitting(true);

  if (typeof AvHostedInputSDK === "undefined") {
    showError("Payment system not loaded. Please refresh the page and try again.");
    return;
  }
  if (typeof AvHostedInputSDK.submitGroup !== "function") {
    showError("Payment submission method not available. Please refresh the page.");
    return;
  }

  const currentPaymentId = getContext().paymentId || "";

  try {
    const submissionResult = AvHostedInputSDK.submitGroup();

    if (submissionResult && typeof submissionResult.then === "function") {
      submissionResult
        .then((paymentData) =>
          mountProcessButton(() => processTransaction(paymentData, currentPaymentId))
        )
        .catch((err) =>
          showError(`Payment submission failed: ${err?.message || String(err)}`)
        );
    } else {
      mountProcessButton(() => processTransaction(submissionResult, currentPaymentId));
    }
  } catch (err) {
    showError(`Payment submission error: ${err?.message || String(err)}`);
  }
}

async function processTransaction(paymentData, paymentId) {
  try {
    const ctx = getContext();
    const payload = {
      paymentData,
      paymentId,
      orderData: {
        eventId: getEventId(),
        deliveryMethod: ctx.deliveryMethod,
        paymentMethod: ctx.paymentMethod,
        eventName: ctx.eventName,
        eventDate: ctx.eventDate,
      },
    };

    const result = await apiCall("/transaction", { body: payload });

    if (result.error === "3ds required" && result.paRequestInfo && result.paRequestURL) {
      const threeDSResult = await launch3DSChallenge({
        paRequestURL: result.paRequestURL,
        paRequestInfo: result.paRequestInfo,
        paymentId,
      });
      if (threeDSResult?.redirectUrl) {
        setTimeout(() => {
          window.location.href = threeDSResult.redirectUrl;
        }, 1500);
      }
      return;
    }

    if (result.success && result.redirectUrl) {
      showSuccess("Payment processed successfully! Redirecting to confirmation...");
      setTimeout(() => {
        window.location.href = result.redirectUrl;
      }, 1500);
      return;
    }

    throw new Error(result.error || "Transaction failed");
  } catch (error) {
    showError(`Transaction failed: ${error?.message || String(error)}`);
  }
}

