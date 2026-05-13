// 3DS (Cardinal Cruise Collect) challenge handler.
//
// On a 3DS-required response, we POST the issuer JWT into a hidden iframe
// pointing at the bank's challenge URL. Cardinal then posts a message back
// to our window with the PaRes; we forward it to /processThreeDSResponse
// and redirect on success.

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

/**
 * Start the 3DS challenge. Returns a promise that resolves on a successful
 * PaRes round-trip ({ success: true, redirectUrl }) or rejects on terminal
 * failure. The Cardinal flow runs entirely via postMessage, so the promise
 * is wired around the message listener.
 */
export function launch3DSChallenge({ paRequestURL, paRequestInfo, paymentId }) {
  return new Promise((resolve, reject) => {
    const jwt = paRequestInfo?.body?.JWT || paRequestInfo?.body || paRequestInfo;
    const responseURL = window.location.href || window.location.origin + "/checkout.html";

    async function onMessage(event) {
      try {
        const result = await apiCall("/processThreeDSResponse", {
          body: {
            paymentId,
            paResponseInformation: event.data,
            paResponseURL: responseURL,
          },
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
