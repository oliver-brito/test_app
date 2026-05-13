/**
 * Hosted Fields Module for AudienceView SDK
 * Handles initialization and management of secure payment fields
 */

class HostedFieldsManager {
  constructor() {
    this.fieldsInitialized = false;
    this.conversationToken = null;
    this.sdkLoaded = false;
    this.fieldValidationStatus = {};
    this.onFieldStatusChange = null;
  }

  /**
   * Initialize hosted fields with the given parameters
   * @param {Object} config - Configuration object
   * @param {string} config.conversationToken - Token for SDK communication
   * @param {string} config.paRequestUrl - Payment API request URL
   * @param {HTMLElement} config.resultContainer - Container for status messages
   * @param {Function} config.onStatusUpdate - Callback for field status updates
   * @param {Function} config.onError - Callback for error handling
   */
  async initializeHostedFields(config) {
    const {
      conversationToken,
      paRequestUrl,
      resultContainer,
      onStatusUpdate,
      onError
    } = config;

    this.conversationToken = conversationToken;
    this.onFieldStatusChange = onStatusUpdate;

    if (!conversationToken) {
      const errorMsg = 'No valid conversation token received. Hosted fields cannot be initialized.';
      this.handleError(errorMsg, resultContainer, onError);
      return false;
    }

    if (!paRequestUrl) {
      const errorMsg = 'No payment URL received from server.';
      this.handleError(errorMsg, resultContainer, onError);
      return false;
    }

    try {
      const success = await this.loadSDK(paRequestUrl, resultContainer, onError);
      if (success) {
        this.initializeFields();
        return true;
      }
      return false;
    } catch (error) {
      this.handleError(`Failed to initialize hosted fields: ${error.message}`, resultContainer, onError);
      return false;
    }
  }

  /**
   * Load the AudienceView SDK script
   * @param {string} paRequestUrl - Payment API request URL
   * @param {HTMLElement} resultContainer - Container for status messages
   * @param {Function} onError - Error callback
   */
  loadSDK(paRequestUrl, resultContainer, onError) {
    return new Promise((resolve, reject) => {
      try {
        const urlObj = new URL(paRequestUrl);
        const sdkUrl = urlObj.origin + '/ui/hosted-field-sdk/sdk.js';
        console.log('Loading SDK from:', sdkUrl);

        const script = document.createElement('script');
        script.src = sdkUrl;
        script.defer = true;

        // Set up a timeout for SDK loading
        const loadingTimeout = setTimeout(() => {
          const errorMsg = 'SDK loading timeout. Please try again.';
          this.handleError(errorMsg, resultContainer, onError);
          reject(new Error('SDK loading timeout'));
        }, 10000); // 10 second timeout

        script.onload = () => {
          clearTimeout(loadingTimeout);
          console.log('SDK script loaded successfully');
          
          // Wait a bit more for the SDK to fully initialize
          setTimeout(() => {
            if (typeof AvHostedInputSDK !== 'undefined') {
              console.log('AvHostedInputSDK loaded:', AvHostedInputSDK);
              this.sdkLoaded = true;
              this.showSuccessMessage('Payment SDK loaded successfully', resultContainer);
              resolve(true);
            } else {
              const errorMsg = 'AvHostedInputSDK is undefined. Hosted fields cannot be initialized.';
              this.handleError(errorMsg, resultContainer, onError);
              reject(new Error('SDK not properly loaded'));
            }
          }, 1000); // Wait 1 second for SDK to fully initialize
        };

        script.onerror = () => {
          clearTimeout(loadingTimeout);
          const errorMsg = 'Failed to load payment SDK. Please check your connection and try again.';
          this.handleError(errorMsg, resultContainer, onError);
          reject(new Error('Failed to load SDK script'));
        };

        document.body.appendChild(script);
      } catch (e) {
        const errorMsg = `Invalid payment URL configuration: ${e.message}`;
        this.handleError(errorMsg, resultContainer, onError);
        reject(e);
      }
    });
  }

  /**
   * Initialize all hosted field inputs
   */
  initializeFields() {
    if (!this.sdkLoaded || !this.conversationToken) {
      console.error('Cannot initialize fields: SDK not loaded or no conversation token');
      return;
    }

    const ups_styles = "input { width: 100%; padding: 12px; border: none; outline: none; font-size: 14px; color: #374151; background: transparent; } input::placeholder { color: #9ca3af; }";

    const fields = [
      {
        containerSelector: '#account_number-container',
        name: 'account-number',
        type: 'PAN'
      },
      {
        containerSelector: '#cvv-container',
        name: 'card-cvv',
        type: 'CVV'
      },
      {
        containerSelector: '#exp_date-container',
        name: 'card-expiration',
        type: 'EXP_DATE'
      }
    ];

    fields.forEach(field => {
      try {
        const hostedInput = AvHostedInputSDK.initInput({
          conversationToken: this.conversationToken,
          containerSelector: field.containerSelector,
          name: field.name,
          type: field.type,
          styles: ups_styles,
          placeholder: '',
        });

        if (hostedInput) {
          hostedInput.onValidationStatusChanged = (status) => this.handleFieldStatusUpdate(field.name, status);
          console.log(`Hosted field ${field.name} initialized successfully`);
        }
      } catch (error) {
        console.error(`Error initializing field ${field.name}:`, error);
      }
    });

    this.fieldsInitialized = true;
    console.log('All hosted fields initialized');
  }

  /**
   * Handle field validation status updates
   * @param {string} fieldName - Name of the field
   * @param {Object} status - Validation status object
   */
  handleFieldStatusUpdate(fieldName, status) {
    // console.log(`Field ${fieldName} status update:`, status);
    
    this.fieldValidationStatus[fieldName] = status;
    
    if (this.onFieldStatusChange) {
      this.onFieldStatusChange(fieldName, status, this.fieldValidationStatus);
    }

    // Update UI status indicator
    this.updateFieldStatusDisplay(fieldName, status);
  }

  /**
   * Update field status display in the UI
   * @param {string} fieldName - Name of the field
   * @param {Object} status - Validation status object
   */
  updateFieldStatusDisplay(fieldName, status) {
    let statusDiv = document.getElementById('field-status');
    if (!statusDiv) {
      statusDiv = document.createElement('div');
      statusDiv.id = 'field-status';
      statusDiv.style.marginTop = '10px';
      
      const resultDiv = document.getElementById('result');
      if (resultDiv) {
        resultDiv.appendChild(statusDiv);
      }
    }

    const allValid = Object.values(this.fieldValidationStatus).every(s => s && s.isValid);
    const hasInvalidFields = Object.values(this.fieldValidationStatus).some(s => s && s.isValid === false);

    if (hasInvalidFields) {
      statusDiv.innerHTML = `<div class="error">Please check all payment fields</div>`;
    } else if (allValid) {
      statusDiv.innerHTML = `<div class="success">All payment fields are valid</div>`;
    } else {
      statusDiv.innerHTML = `<div class="label">Please fill in all payment fields</div>`;
    }
  }

  /**
   * Handle errors and display them
   * @param {string} message - Error message
   * @param {HTMLElement} container - Container for error display
   * @param {Function} onError - Error callback
   */
  handleError(message, container, onError) {
    console.error(message);
    
    if (container) {
      const errorDiv = document.createElement('div');
      errorDiv.className = 'error';
      errorDiv.textContent = message;
      container.appendChild(errorDiv);
    }

    if (onError) {
      onError(message);
    }
  }

  /**
   * Show success message
   * @param {string} message - Success message
   * @param {HTMLElement} container - Container for message display
   */
  showSuccessMessage(message, container) {
    if (container) {
      const successDiv = document.createElement('div');
      successDiv.className = 'success';
      successDiv.textContent = message;
      container.appendChild(successDiv);
    }
  }

  /**
   * Get current validation status of all fields
   * @returns {Object} Validation status object
   */
  getValidationStatus() {
    return { ...this.fieldValidationStatus };
  }

  /**
   * Reset all field validation statuses
   */
  resetValidation() {
    this.fieldValidationStatus = {};
    const statusDiv = document.getElementById('field-status');
    if (statusDiv) {
      statusDiv.innerHTML = '';
    }
  }
}

// Export for use in other files
window.HostedFieldsManager = HostedFieldsManager;
