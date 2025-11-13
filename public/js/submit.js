function handleSubmit(event) {
  // Prevent default form submission and run our hosted-fields flow instead
  event.preventDefault();

  // UI elements
  const submitButton = document.getElementById('submit-button');
  const resultDiv = document.getElementById('result');

  // Disable submit button immediately to avoid duplicate submissions
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = 'Processing...';
  }

  // Guard: ensure AvHostedInputSDK is present and has the submission method
  if (typeof AvHostedInputSDK === 'undefined') {
    showError('Payment system not loaded. Please refresh the page and try again.');
    return;
  }

  if (typeof AvHostedInputSDK.submitGroup !== 'function') {
    showError('Payment submission method not available. Please refresh the page.');
    return;
  }

  // Try to submit the hosted fields group. The SDK may return a Promise or a sync value.
  try {
    const currentPaymentID = window.paymentID || '';
    const submissionResult = AvHostedInputSDK.submitGroup();

    // Render a button which, when clicked, will call our server transaction endpoint
    function showProcessButton(paymentData, pid) {
      // Remove any previous manual-process button to avoid duplicates
      const previous = document.getElementById('manual-process-btn');
      if (previous) previous.remove();

      const container = document.getElementById('result');
      const button = document.createElement('button');
      button.id = 'manual-process-btn';
      button.className = 'btn';
      button.textContent = 'Continue to Process Transaction';
      button.style.marginTop = '20px';

      button.onclick = async function() {
        button.disabled = true;
        button.textContent = 'Processing...';
        await processTransaction(paymentData, pid);
      };

      container.appendChild(button);
    }

    // Handle both Promise-returning and synchronous SDK results
    if (submissionResult && typeof submissionResult.then === 'function') {
      submissionResult.then((paymentData) => {
        showProcessButton(paymentData, currentPaymentID);
      }).catch((err) => {
        showError(`Payment submission failed: ${err && err.message ? err.message : String(err)}`);
      });
    } else {
      // Synchronous return path
      showProcessButton(submissionResult, currentPaymentID);
    }
  } catch (err) {
    showError(`Payment submission error: ${err && err.message ? err.message : String(err)}`);
  }

  // Sends the assembled paymentData to the server's /transaction endpoint
  async function processTransaction(paymentData, pid) {
    try {
      const payload = {
        paymentData: paymentData,
        paymentId: pid,
        orderData: {
          eventId: localStorage.getItem('eventId'),
          deliveryMethod: localStorage.getItem('deliveryMethod'),
          paymentMethod: localStorage.getItem('paymentMethod'),
          eventName: localStorage.getItem('eventName'),
          eventDate: localStorage.getItem('eventDate')
        }
      };

      const response = await fetch('/transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      // 3DS required: initiate Cardinal Cruise Collect via hidden iframe and form POST
        if (result.error === "3ds required" && result.paRequestInfo && result.paRequestURL) {
          console.log("📌 3DS required detected:", result);

          const paRequestURL = result.paRequestURL.standard || result.paRequestURL;
          const jwt = result.paRequestInfo.body.JWT || result.paRequestInfo.body?.JWT || result.paRequestInfo.body; // fallback if structure differs

          // Early raw listener to observe ALL postMessages (no once:true so we don't miss final message)
          window.addEventListener('message', async (e) => {
             // Send a single JSON POST and await the response so we don't duplicate requests
            var payload = {
              paymentId: pid,
              pa_response_information: e.data,
              pa_response_URL: window.location.href || "https://localhost:3444/checkout.html"
            };
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
          });

          // Single hidden iframe (no nested iframe) for Cruise Collect form POST
          const iframe = document.createElement('iframe');
          iframe.style.width = '0';
          iframe.style.height = '0';
          iframe.style.border = '0';
          iframe.id = 'cardinal-iframe';
          iframe.name = 'cardinalFrame';
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
      if (result.success && result.redirectUrl) {
        showSuccess('Payment processed successfully! Redirecting to confirmation...');
        setTimeout(() => { window.location.href = result.redirectUrl; }, 1500);
      } else {
        throw new Error(result.error || 'Transaction failed');
      }
    } catch (error) {
      showError(`Transaction failed: ${error && error.message ? error.message : String(error)}`);
    }
  }

  // Display an error message in the result area and re-enable submit button
  function showError(message) {
    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = 'Submit Payment';
    }

    // Remove any previous error messages
    const existingErrors = resultDiv.querySelectorAll('.payment-error');
    existingErrors.forEach(el => el.remove());

    const errorNode = document.createElement('div');
    errorNode.className = 'error payment-error';
    errorNode.style.marginTop = '16px';
    errorNode.textContent = message;
    resultDiv.appendChild(errorNode);
  }

  // Display a transient success message
  function showSuccess(message) {
    const existing = resultDiv.querySelectorAll('.payment-error, .payment-success');
    existing.forEach(el => el.remove());

    const successNode = document.createElement('div');
    successNode.className = 'success payment-success';
    successNode.style.marginTop = '16px';
    successNode.textContent = message;
    resultDiv.appendChild(successNode);
  }
}