// Orchestrator for checkout page: compose DOM, API and Adyen helpers
async function doCheckout() {
	const ctx = window.getCheckoutContext();
	const { eventId, deliveryMethod, paymentMethod, resultDiv } = ctx;

	try {
		const data = await window.fetchCheckoutData({ eventId, deliveryMethod, paymentMethod });
		const payment_details = data.payment_details || {};
		console.log(payment_details);
		let pa_request_url = payment_details.pa_request_URL?.standard || '';
		let conversationToken = payment_details.server_to_client_token?.standard || '';
		let paymentID = payment_details.payment_id?.standard || '';
		window.paymentID = paymentID;
        //store paymentID in localStorage for later retrieval
        localStorage.setItem('paymentID', paymentID);
		await window.determineAdyenFlag(paymentID);

		const tokens = window.allowOverrideFromHashMaybe({ conversationToken, paymentID });
		conversationToken = tokens.conversationToken;
		paymentID = tokens.paymentID;

		window.renderCheckoutInfo(resultDiv, window.adyen, eventId, deliveryMethod, paymentMethod, pa_request_url, conversationToken, paymentID);

		if (window.adyen) {
			const adyenContainer = document.createElement('div');
			adyenContainer.id = 'adyen-dropin-container';
			resultDiv.appendChild(adyenContainer);
			window.renderAdyenDropIn(resultDiv);
		} else {
			window.initHostedFields(conversationToken, pa_request_url, resultDiv);
		}

		const convRef = { value: conversationToken, eventId, deliveryMethod, paymentMethod, pa_request_url };
		const pidRef = { value: paymentID };
		window.wireChangeInfoButton(convRef, pidRef, resultDiv);
	} catch (err) {
		resultDiv.innerHTML = `<div class="error">Checkout failed: ${err.message}</div>`;
	}
}

// Expose for inline script to call after scripts load
window.doCheckout = doCheckout;

