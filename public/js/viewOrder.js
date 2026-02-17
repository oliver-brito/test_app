// Order confirmation page functionality
(async function() {
  'use strict';

  /**
   * Load and display order details
   */
  async function loadOrderDetails() {
    // Check auth and refresh server credentials before loading order
    if (!(await window.checkAndRefreshAuth())) {
      return; // Will redirect to login
    }

    const contentDiv = document.getElementById('order-content');

    try {
      // Get URL parameters
      const urlParams = new URLSearchParams(window.location.search);
      const orderId = urlParams.get('orderId');
      const transactionId = urlParams.get('transactionId');

      if (!orderId || !transactionId) {
        contentDiv.innerHTML = `
          <div class="error">
            Invalid order information. Please check your confirmation email or contact support.
          </div>
        `;
        return;
      }

      // Fetch real order details from the server
      const response = await fetch('/order', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const orderResponse = await response.json();

      if (!orderResponse.success) {
        throw new Error('Failed to fetch order details');
      }

      const orderData = orderResponse.order;
      const eventName = localStorage.getItem('eventName') || 'Event';
      const eventDate = localStorage.getItem('eventDate') || 'TBD';
      const deliveryMethod = localStorage.getItem('deliveryMethod') || 'Email';

      // Helper function to check if a field has a meaningful value
      const hasValue = (field) => {
        if (!field || !field.standard) return false;
        const value = field.standard;
        return value !== "" && value !== "0" && value !== "0.00" && value !== null;
      };

      // Helper function to get display value or fallback to standard
      const getValue = (field) => {
        if (!field) return "";
        return field.display || field.standard || "";
      };

      // Extract meaningful order information
      const orderDetails = {
        orderId: orderId,
        transactionId: transactionId,
        date: new Date().toLocaleDateString(),
        time: new Date().toLocaleTimeString(),

        // Financial information
        grandTotal: hasValue(orderData.grand_total) ? getValue(orderData.grand_total) : null,
        totalAmount: hasValue(orderData.total_amount) ? getValue(orderData.total_amount) : null,
        paymentTotal: hasValue(orderData.payment_total) ? getValue(orderData.payment_total) : null,
        totalNet: hasValue(orderData.total_net) ? getValue(orderData.total_net) : null,
        due: hasValue(orderData.due) ? getValue(orderData.due) : null,

        // Charges
        totalCharge1: hasValue(orderData.total_charge1) ? getValue(orderData.total_charge1) : null,
        totalCharge2: hasValue(orderData.total_charge2) ? getValue(orderData.total_charge2) : null,
        chargeAmount: hasValue(orderData.charge_amount) ? getValue(orderData.charge_amount) : null,

        // Admission information
        admissionTotal: hasValue(orderData.admission_total_amount) ? getValue(orderData.admission_total_amount) : null,
        admissionNet: hasValue(orderData.admission_net) ? getValue(orderData.admission_net) : null,
        admissionCount: hasValue(orderData.countAdm) ? getValue(orderData.countAdm) : null,
        admissionsAdded: hasValue(orderData.admissions_added) ? getValue(orderData.admissions_added) : null,

        // Order metadata
        orderId_system: hasValue(orderData.order_id) ? getValue(orderData.order_id) : null,
        orderNumber: hasValue(orderData.order_number) ? getValue(orderData.order_number) : null,
        customerId: hasValue(orderData.customer_id) ? getValue(orderData.customer_id) : null,
        deliveryType: hasValue(orderData.deliveryType) ? getValue(orderData.deliveryType) : null,

        // Invoice information
        invoiceNumber: hasValue(orderData.invoice_number) ? getValue(orderData.invoice_number) : null,
        invoiceDate: hasValue(orderData.invoice_date) ? getValue(orderData.invoice_date) : null,

        // Fallback values
        eventName: eventName,
        eventDate: eventDate,
        deliveryMethod: deliveryMethod,
        status: 'Confirmed'
      };

      // Build the details HTML dynamically
      let detailsHtml = '<div class="order-details"><h3>Order Details</h3>';

      // Essential order information
      detailsHtml += `
        <div class="detail-row">
          <span class="label">Order ID:</span>
          <span class="value transaction-id">${orderDetails.orderNumber || orderDetails.orderId_system || orderDetails.orderId}</span>
        </div>
        <div class="detail-row">
          <span class="label">Transaction ID:</span>
          <span class="value transaction-id">${orderDetails.transactionId}</span>
        </div>
        <div class="detail-row">
          <span class="label">Date:</span>
          <span class="value">${orderDetails.date} at ${orderDetails.time}</span>
        </div>
      `;

      // Event information
      detailsHtml += `
        <div class="detail-row">
          <span class="label">Event:</span>
          <span class="value">${orderDetails.eventName}</span>
        </div>
        <div class="detail-row">
          <span class="label">Event Date:</span>
          <span class="value">${orderDetails.eventDate}</span>
        </div>
      `;

      // Financial information - show the most relevant total
      const displayAmount = orderDetails.grandTotal || orderDetails.totalAmount || orderDetails.admissionTotal || orderDetails.paymentTotal;
      if (displayAmount) {
        detailsHtml += `
          <div class="detail-row">
            <span class="label">Total Amount:</span>
            <span class="value">${displayAmount}</span>
          </div>
        `;
      }

      // Payment information
      if (orderDetails.paymentTotal) {
        detailsHtml += `
          <div class="detail-row">
            <span class="label">Payment Total:</span>
            <span class="value">${orderDetails.paymentTotal}</span>
          </div>
        `;
      }

      if (orderDetails.due) {
        detailsHtml += `
          <div class="detail-row">
            <span class="label">Amount Due:</span>
            <span class="value">${orderDetails.due}</span>
          </div>
        `;
      }

      // Admission details
      if (orderDetails.admissionCount) {
        detailsHtml += `
          <div class="detail-row">
            <span class="label">Number of Tickets:</span>
            <span class="value">${orderDetails.admissionCount}</span>
          </div>
        `;
      }

      if (orderDetails.admissionsAdded) {
        detailsHtml += `
          <div class="detail-row">
            <span class="label">Tickets Added:</span>
            <span class="value">${orderDetails.admissionsAdded}</span>
          </div>
        `;
      }

      // Charges breakdown
      if (orderDetails.totalCharge1) {
        detailsHtml += `
          <div class="detail-row">
            <span class="label">Service Charge:</span>
            <span class="value">${orderDetails.totalCharge1}</span>
          </div>
        `;
      }

      if (orderDetails.totalCharge2) {
        detailsHtml += `
          <div class="detail-row">
            <span class="label">Additional Charge:</span>
            <span class="value">${orderDetails.totalCharge2}</span>
          </div>
        `;
      }

      // Delivery information
      detailsHtml += `
        <div class="detail-row">
          <span class="label">Delivery Method:</span>
          <span class="value">${orderDetails.deliveryMethod}</span>
        </div>
      `;

      if (orderDetails.deliveryType) {
        detailsHtml += `
          <div class="detail-row">
            <span class="label">Delivery Type:</span>
            <span class="value">${orderDetails.deliveryType}</span>
          </div>
        `;
      }

      // Invoice information
      if (orderDetails.invoiceNumber) {
        detailsHtml += `
          <div class="detail-row">
            <span class="label">Invoice Number:</span>
            <span class="value transaction-id">${orderDetails.invoiceNumber}</span>
          </div>
        `;
      }

      if (orderDetails.invoiceDate) {
        detailsHtml += `
          <div class="detail-row">
            <span class="label">Invoice Date:</span>
            <span class="value">${orderDetails.invoiceDate}</span>
          </div>
        `;
      }

      // Status
      detailsHtml += `
        <div class="detail-row">
          <span class="label">Status:</span>
          <span class="value success">${orderDetails.status}</span>
        </div>
      `;

      detailsHtml += '</div>';

      contentDiv.innerHTML = detailsHtml + `
        <div style="background: #ecfdf5; border: 1px solid rgba(5,150,105,.25); border-radius: 8px; padding: 16px; margin-top: 16px;">
          <p style="margin: 0; color: #065f46;"><strong>What's Next?</strong></p>
          <p style="margin: 8px 0 0 0; color: #065f46;">
            You will receive a confirmation email shortly with your tickets (if applicable) and event details.
            Please keep your order ID for your records.
          </p>
        </div>
      `;

    } catch (error) {
      console.error('Error loading order details:', error);
      contentDiv.innerHTML = `
        <div class="error">
          Unable to load order details from server: ${error.message}. Please contact support with your transaction ID.
        </div>
      `;
    }
  }

  // Load order details when the page loads
  loadOrderDetails();
})();
