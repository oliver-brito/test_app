// Mounts the Adyen Drop-in inside the checkout result container and handles
// the 3DS return-URL flow.

import { getPaymentConfiguration, getPaymentResponse, handleAdyenSubmit } from "./adyenApi.js";

export async function renderAdyenDropIn(resultDiv) {
  const clientConfig = await getPaymentConfiguration();
  const paymentMethodsPayload = await getPaymentResponse();

  const dropinContainer = document.createElement("div");
  dropinContainer.id = "adyen-dropin-container";
  dropinContainer.className = "adyen-dropin";
  resultDiv.appendChild(dropinContainer);

  try {
    if (!paymentMethodsPayload?.success || !paymentMethodsPayload.paymentMethodsResponse) {
      throw new Error("Invalid or missing payment methods response from server");
    }

    const adyenConfiguration = {
      environment: clientConfig.environment,
      clientKey: clientConfig.clientKey,
      countryCode: clientConfig.countryCode,
      paymentMethodsResponse: paymentMethodsPayload.paymentMethodsResponse,
      amount: {
        value: Math.round(parseFloat(window.orderTotal || "0") * 100),
        currency: clientConfig.currency,
      },
      onSubmit: (state, dropin) => handleAdyenSubmit(state, dropin),
      onAdditionalDetails: (state, dropin) => handleAdyenSubmit(state, dropin),
      onError: (err) => {
        console.error("Adyen Drop-in error:", err);
        alert("Payment error: " + err.message);
      },
      onLoad: () => console.log("Adyen Drop-in loaded"),
    };

    const { AdyenCheckout, Dropin } = window.AdyenWeb;
    window.adyenCheckout = await AdyenCheckout(adyenConfiguration);

    const dropinOptions = {
      paymentMethodsConfiguration: {
        card: {
          hasHolderName: true,
          holderNameRequired: true,
          billingAddressRequired: true,
        },
      },
    };

    window.adyenDropin = new Dropin(window.adyenCheckout, dropinOptions);
    window.adyenDropin.mount("#" + dropinContainer.id);
  } catch (initError) {
    console.error("Error initializing Adyen Drop-in:", initError);
    resultDiv.innerHTML += `<div class="error">Error initializing Adyen Drop-in: ${initError.message}</div>`;
  }
}

/**
 * Encode a query string into the UPS-style PaRes information string.
 * "PaRes=abc&MD=123" → "00005PaRes00003abc00002MD00003123"
 * (5-digit zero-padded key length, key, 5-digit value length, value).
 */
function encodePaResponseInformation(query) {
  if (!query) return "";
  const q = query.startsWith("?") ? query.substring(1) : query;
  return q
    .split("&")
    .map((pair) => {
      const [key, rawValue = ""] = pair.split("=", 2);
      const value = decodeURIComponent(rawValue);
      const klen = key.length.toString().padStart(5, "0");
      const vlen = value.length.toString().padStart(5, "0");
      return `${klen}${key}${vlen}${value}`;
    })
    .join("");
}

/** Known 3DS / Cardinal / UPS return-URL params. If none of these are
 * present, the query string is just our own routing (e.g. ?eventId=01)
 * and we don't have a PaRes to submit. */
const THREE_DS_PARAM_NAMES = [
  "PaRes",
  "MD",
  "cres",
  "threeDSSessionData",
  "transStatus",
  "redirectResult",
  "payload",
];

function looksLikeThreeDSReturn(searchString) {
  if (!searchString) return false;
  const params = new URLSearchParams(searchString);
  return THREE_DS_PARAM_NAMES.some((name) => params.has(name));
}

/**
 * Handle URL parameters returned from a 3DS authentication redirect.
 * Encodes the query string and POSTs it to /processThreeDSResponse.
 * Returns { urlHandled: false } immediately when the query doesn't look
 * like a 3DS return (so a normal `?eventId=...` page load doesn't fire
 * a spurious request).
 */
export async function handleUrlParameters(paymentId) {
  const query = window.location.search.substring(1);
  if (!query) return { urlHandled: false };
  if (!looksLikeThreeDSReturn(query)) return { urlHandled: false };

  const encoded = encodePaResponseInformation(query);
  const paResponseUrl = window.location.href || window.location.origin + "/checkout.html";

  const payload = {
    paymentId: paymentId || null,
    paResponseInformation: encoded,
    paResponseURL: paResponseUrl,
  };

  try {
    const resp = await fetch("/processThreeDSResponse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const resultText = await resp.text();
    let result;
    try {
      result = JSON.parse(resultText);
    } catch {
      result = resultText;
    }

    if (resp.ok && result?.success && result.redirectUrl) {
      setTimeout(() => {
        window.location.href = result.redirectUrl;
      }, 1500);
      return { urlHandled: true };
    }
    if (result?.cancelled) {
      return { urlHandled: false };
    }
    throw new Error(
      result?.error || (typeof result === "string" ? result : "Transaction failed")
    );
  } catch (e) {
    console.error("Error sending PaRes (JSON):", e);
    return { urlHandled: false };
  }
}

// Window aliases used by the checkout.html inline bootstrap script and by
// ui/checkoutDom.js (rendered HTML calls window.renderAdyenDropIn).
window.renderAdyenDropIn = renderAdyenDropIn;
window.handleUrlParameters = handleUrlParameters;
