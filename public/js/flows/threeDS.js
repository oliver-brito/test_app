// 3DS challenge handler (Cardinal Cruise / Cybersource Smartpay Fuse / Adyen).
//
// On a 3DS-required response, we POST the issuer JWT into a hidden iframe
// pointing at the bank's challenge URL. Cardinal then posts message(s)
// back to our window with the PaRes / device-fingerprint payload; we
// forward the first usable message to /processThreeDSResponse, redirect
// on success, and detach the listener so subsequent messages from other
// origins don't trigger spurious POSTs.

import { apiCall } from "../shared/api.js";

function mountCardinalIframe(paRequestURL, jwt) {
  const iframe = document.createElement("iframe");
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.id = "cardinal-iframe";
  iframe.name = "cardinalFrame";
  document.body.appendChild(iframe);

  const html = `
    <html>
      <body onload="document.forms[0].submit()">
        <form action="${paRequestURL}" method="POST" target="_self">
          <input type="hidden" name="JWT" value="${jwt}" />
        </form>
      </body>
    </html>
  `;
  iframe.contentDocument.open();
  iframe.contentDocument.write(html);
  iframe.contentDocument.close();
}

/** 3DS / PA messages can come from Cardinal Cruise (Cybersource direct),
 * Adyen 3DS hosts, or the AV-hosted UPS payment form
 * (dev.payments.audienceview.com / payments.audienceview.com) which proxies
 * Smartpay Fuse. Anything else (DevTools, unrelated iframes) is noise. */
const TRUSTED_3DS_HOST_SUFFIXES = [
  ".cardinalcommerce.com",
  ".cardinaltrusted.com",
  ".audienceview.com",
  ".adyen.com",
];

function isTrustedOrigin(origin) {
  if (!origin) return false;
  const host = new URL(origin).hostname.toLowerCase();
  return TRUSTED_3DS_HOST_SUFFIXES.some(
    (suffix) => host === suffix.slice(1) || host.endsWith(suffix)
  );
}

/**
 * Start the 3DS challenge. Returns a promise that resolves on a successful
 * PaRes round-trip ({ success: true, redirectUrl }) or rejects on terminal
 * failure. The Cardinal flow runs entirely via postMessage.
 */
export function launch3DSChallenge({ paRequestURL, paRequestInfo, paymentId }) {
  return new Promise((resolve, reject) => {
    const jwt = paRequestInfo?.body?.JWT || paRequestInfo?.body || paRequestInfo;
    const responseURL = window.location.href || window.location.origin + "/checkout.html";

    let settled = false;

    function cleanup() {
      window.removeEventListener("message", onMessage);
      document.getElementById("cardinal-iframe")?.remove();
    }

    async function onMessage(event) {
      if (settled) return;
      // Cross-origin postMessages without an origin (event.data === null,
      // event.origin === "") happen during iframe init; ignore them.
      if (!event.data) return;
      try {
        if (!isTrustedOrigin(event.origin)) return;
      } catch {
        return; // origin not a valid URL
      }

      settled = true;
      cleanup();

      try {
        const result = await apiCall("/processThreeDSResponse", {
          body: {
            paymentId,
            paResponseInformation: event.data,
            paResponseURL: responseURL,
          },
          showErrorModal: false,
        });

        if (result?.success && result.redirectUrl) {
          resolve(result);
        } else {
          reject(new Error(result?.error || (typeof result === "string" ? result : "Transaction failed")));
        }
      } catch (e) {
        reject(e);
      }
    }

    window.addEventListener("message", onMessage);
    mountCardinalIframe(paRequestURL.standard || paRequestURL, jwt);
  });
}
