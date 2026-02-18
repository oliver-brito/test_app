// public/js/myaccount.js
// Handles fetching and displaying customer account information

(async function() {
  // Check auth and refresh server credentials before proceeding
  if (!(await window.checkAndRefreshAuth())) {
    return; // Will redirect to login
  }

  try {
    // Fetch customer data from backend
    const response = await apiCall('/getMyAccountDetails', {}, true);

    if (!response.success) {
      showError('Failed to load account details');
      return;
    }

    const data = response.response?.data;
    if (!data) {
      showError('No account data available');
      return;
    }

    // Render customer information
    renderCustomerInfo(data.Customer);
    renderContactInfo(data.Contacts);
    renderAddressInfo(data.Addresses);
    renderSavedPaymentsInfo(data.Payments);

    // Hide loading indicator
    document.getElementById('loading-indicator')?.remove();
  } catch (error) {
    console.error('Error loading account details:', error);
    showError('An error occurred while loading your account details');
  }
})();

/**
 * Renders customer information section
 */
function renderCustomerInfo(customer) {
  if (!customer) return;

  const container = document.getElementById('customer-info');
  if (!container) return;

  const customerNumber = customer.customer_number?.standard || 'N/A';
  const customerType = customer.customer_type?.standard || 'N/A';
  const activeDate = customer.active_date?.standard || 'N/A';
  const status = customer.status?.standard || 'N/A';

  container.innerHTML = `
    <h2 class="section-title">Customer Information</h2>
    <div class="info-grid">
      <div class="info-item">
        <span class="info-label">Customer Number:</span>
        <span class="info-value">${customerNumber}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Account Type:</span>
        <span class="info-value">${capitalize(customerType)}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Active Since:</span>
        <span class="info-value">${formatDate(activeDate)}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Status:</span>
        <span class="info-value">${capitalize(status)}</span>
      </div>
    </div>
  `;
}

/**
 * Renders contact information section
 */
function renderContactInfo(contacts) {
  if (!contacts) return;

  const container = document.getElementById('contact-info');
  if (!container) return;

  // Contacts could be an object with numbered keys or an array
  const contactsList = Object.values(contacts).filter(c => c && typeof c === 'object' && c.first_name);

  if (contactsList.length === 0) {
    container.innerHTML = `
      <h2 class="section-title">Contact Information</h2>
      <p class="no-data">No contact information available</p>
    `;
    return;
  }

  // Use the first contact (primary contact)
  const contact = contactsList[0];
  const firstName = contact.first_name?.standard || '';
  const lastName = contact.last_name?.standard || '';
  const email = contact.email?.standard || 'N/A';
  const phone = contact. vphone_number?.standard || 'N/A';

  container.innerHTML = `
    <h2 class="section-title">Contact Information</h2>
    <div class="info-grid">
      <div class="info-item">
        <span class="info-label">Name:</span>
        <span class="info-value">${firstName} ${lastName}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Email:</span>
        <span class="info-value">${email}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Phone:</span>
        <span class="info-value">${phone}</span>
      </div>
    </div>
  `;
}

/**
 * Renders address information section
 */
function renderAddressInfo(addresses) {
  if (!addresses) return;

  const container = document.getElementById('address-info');
  if (!container) return;

  // Addresses could be an object with numbered keys or an array
  const addressList = Object.values(addresses).filter(a => a && typeof a === 'object' && a.street);

  if (addressList.length === 0) {
    container.innerHTML = `
      <h2 class="section-title">Address Information</h2>
      <p class="no-data">No address information available</p>
    `;
    return;
  }

  // Use the first address (primary address)
  const address = addressList[0];
  const street = address.street?.standard || '';
  const city = address.city?.standard || '';
  const province = address.state?.standard || '';
  const zip = address.zip?.standard || '';
  const country = address.country?.standard || '';

  container.innerHTML = `
    <h2 class="section-title">Address Information</h2>
    <div class="info-grid">
      <div class="info-item full-width">
        <span class="info-label">Street:</span>
        <span class="info-value">${street}</span>
      </div>
      <div class="info-item">
        <span class="info-label">City:</span>
        <span class="info-value">${city}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Province/State:</span>
        <span class="info-value">${province || 'N/A'}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Postal Code:</span>
        <span class="info-value">${zip}</span>
      </div>
      <div class="info-item">
        <span class="info-label">Country:</span>
        <span class="info-value">${country}</span>
      </div>
    </div>
  `;
}

function renderSavedPaymentsInfo(payments) {
  const container = document.getElementById('saved-payments-info');
  if (!container) return;

  // Check if payments object has any actual payment methods (not just "state")
  const hasPayments = payments && Object.keys(payments).some(key => key !== 'state' && payments[key]);

  if (!hasPayments) {
    container.innerHTML = `
      <h2 class="section-title">Saved Payment Methods</h2>
      <p class="no-data">No saved payment methods available</p>
    `;
    // button to add new payment method (mock)
    const addButton = document.createElement('button');
    addButton.textContent = 'Add New Payment Method';
    addButton.className = 'add-payment-btn';
    addButton.onclick = () => addNewPaymentMethod();
    container.appendChild(addButton);
    return;
  }

  // If we reach here, there are actual payment methods - render them
  container.innerHTML = `
    <h2 class="section-title">Saved Payment Methods</h2>
    <p class="no-data">Payment methods found (rendering not yet implemented)</p>
  `;

  // button to add new payment method (mock)
  const addButton = document.createElement('button');
  addButton.textContent = 'Add New Payment Method';
  addButton.className = 'add-payment-btn';
  addButton.onclick = () => addNewPaymentMethod();
  container.appendChild(addButton);
}

async function addNewPaymentMethod() {
  alert('Add new payment method functionality not implemented in this demo');
}

/**
 * Utility: Capitalize first letter of string
 */
function capitalize(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Utility: Format date string
 */
function formatDate(dateStr) {
  if (!dateStr || dateStr === 'N/A') return 'N/A';

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;

    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return dateStr;
  }
}

/**
 * Display error message
 */
function showError(message) {
  const container = document.querySelector('.account-container');
  if (!container) return;

  container.innerHTML = `
    <div class="error-message">
      <p style="margin: 0; color: #dc2626; font-size: 1rem;">
        ⚠️ ${message}
      </p>
      <button onclick="window.location.reload()" style="margin-top: 16px; padding: 8px 16px; background: #dc2626; color: white; border: none; border-radius: 6px; cursor: pointer;">
        Retry
      </button>
    </div>
  `;
}
