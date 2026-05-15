// Submit button + banner UI for the checkout payment form.

const RESULT_SELECTOR = "#result";
const SUBMIT_BUTTON_SELECTOR = "#submit-button";

function $result() {
  return document.querySelector(RESULT_SELECTOR);
}

function $submitButton() {
  return document.querySelector(SUBMIT_BUTTON_SELECTOR);
}

export function setSubmitting(isSubmitting) {
  const btn = $submitButton();
  if (!btn) return;
  btn.disabled = isSubmitting;
  btn.textContent = isSubmitting ? "Processing..." : "Submit Payment";
}

export function showError(message) {
  setSubmitting(false);
  const container = $result();
  if (!container) return;
  container.querySelectorAll(".payment-error").forEach((el) => el.remove());

  const node = document.createElement("div");
  node.className = "error payment-error";
  node.style.marginTop = "16px";
  node.textContent = message;
  container.appendChild(node);
}

export function showSuccess(message) {
  const container = $result();
  if (!container) return;
  container.querySelectorAll(".payment-error, .payment-success").forEach((el) => el.remove());

  const node = document.createElement("div");
  node.className = "success payment-success";
  node.style.marginTop = "16px";
  node.textContent = message;
  container.appendChild(node);
}

/**
 * Mount a "Continue to Process Transaction" button that calls the supplied
 * handler when clicked. Used after Av's hosted-fields submission resolves,
 * to give the user one explicit step before posting to /transaction.
 */
export function mountProcessButton(onClick) {
  document.getElementById("manual-process-btn")?.remove();

  const container = $result();
  const button = document.createElement("button");
  button.id = "manual-process-btn";
  button.className = "btn";
  button.textContent = "Continue to Process Transaction";
  button.style.marginTop = "20px";
  button.onclick = async () => {
    button.disabled = true;
    button.textContent = "Processing...";
    await onClick();
  };
  container.appendChild(button);
}
