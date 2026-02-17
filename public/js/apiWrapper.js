// API Wrapper with automatic error modal display
// This module wraps fetch calls to automatically show the error modal when API calls fail

(function() {
  // Store original fetch
  const originalFetch = window.fetch;

  /**
   * Enhanced fetch wrapper that automatically shows error modal on failures
   * @param {string} url - The URL to fetch
   * @param {object} options - Fetch options
   * @param {boolean} showErrorModal - Whether to show error modal on failure (default: true)
   * @returns {Promise<Response>}
   */
  window.fetchWithErrorHandling = async function(url, options = {}, showErrorModal = true) {
    // Ensure error modal is available
    if (showErrorModal && typeof window.showApiError !== 'function') {
      console.warn('showApiError not available, error modal may not display');
    }
    const requestData = {
      url,
      method: options.method || 'GET',
      headers: options.headers || {},
      timestamp: new Date().toISOString()
    };

    // Try to parse body if it's a string
    if (options.body) {
      try {
        requestData.body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body;
      } catch {
        requestData.body = options.body;
      }
    }

    try {
      const response = await originalFetch(url, options);

      // Clone response to read it without consuming it
      const clonedResponse = response.clone();

      // Parse response data first to check for auth errors
      let responseData;
      try {
        responseData = await clonedResponse.json();
      } catch {
        try {
          responseData = await clonedResponse.text();
        } catch {
          responseData = 'Unable to read response';
        }
      }

      // Check for authentication errors (status codes or error messages)
      const isAuthError = (response.status === 401 || response.status === 403) ||
                          (responseData && typeof responseData === 'object' &&
                           (responseData.error === 'Not authenticated' ||
                            responseData.error === 'Auth failed' ||
                            responseData.details === 'Not authenticated'));

      if (isAuthError && showErrorModal) {
        const currentPath = window.location.pathname + window.location.search;
        const returnUrl = encodeURIComponent(currentPath);
        window.location.href = `/login.html?session_expired=true&return_url=${returnUrl}`;
        return;
      }

      // Only show error modal for failed requests
      if (!response.ok && showErrorModal) {

        // Check if backend already provided structured error data
        if (responseData && typeof responseData === 'object' && responseData.error) {
          // Backend provided structured error - use it directly
          if (typeof window.showApiError === 'function') {
            window.showApiError({
              endpoint: responseData.endpoint || url,
              error: responseData.error || responseData.message,
              status: responseData.status || response.status,
              request: responseData.request || requestData,
              response: responseData.response || responseData.details || responseData
            });
          } else {
            console.error('API Error:', responseData);
          }
        } else {
          // Fallback for non-structured errors
          if (typeof window.showApiError === 'function') {
            window.showApiError({
              endpoint: url,
              error: `Request failed with status ${response.status}`,
              status: response.status,
              request: requestData,
              response: responseData
            });
          } else {
            console.error('API Error:', { url, status: response.status, responseData });
          }
        }
      }

      return response;
    } catch (error) {
      // Network error or other fetch failure
      if (showErrorModal) {
        if (typeof window.showApiError === 'function') {
          window.showApiError({
            endpoint: url,
            error: `Network error: ${error.message}`,
            status: 0,
            request: requestData,
            response: {
              error: error.message,
              type: 'NetworkError',
              stack: error.stack
            }
          });
        } else {
          console.error('Network Error:', error);
        }
      }
      throw error;
    }
  };

  /**
   * Helper to make API calls with automatic error handling
   * @param {string} endpoint - The endpoint path (e.g., '/login', '/events')
   * @param {object} options - Additional options
   * @param {object} options.body - Request body (will be JSON.stringify'd)
   * @param {string} options.method - HTTP method (default: POST)
   * @param {boolean} options.showErrorModal - Show error modal on failure (default: true)
   * @returns {Promise<any>} - Parsed JSON response
   */
  window.apiCall = async function(endpoint, options = {}) {
    const {
      body = null,
      method = 'POST',
      showErrorModal = true,
      ...fetchOptions
    } = options;

    const fetchConfig = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...fetchOptions.headers
      },
      ...fetchOptions
    };

    if (body) {
      fetchConfig.body = JSON.stringify(body);
    }

    // Prepare request data for logging
    const requestData = {
      method,
      endpoint,
      body: body || {},
      timestamp: new Date().toISOString()
    };

    try {
      const response = await window.fetchWithErrorHandling(endpoint, fetchConfig, showErrorModal);

      // Clone response to read it without consuming
      const clonedResponse = response.clone();

      // Parse response data
      let responseData;
      try {
        responseData = await clonedResponse.json();
      } catch {
        try {
          responseData = await clonedResponse.text();
        } catch {
          responseData = 'Unable to read response';
        }
      }

      // Log to debug console if available
      if (typeof window.apiDebugConsole !== 'undefined') {
        // ONLY log backend API calls (to AudienceView)
        if (responseData && responseData.backendApiCalls && Array.isArray(responseData.backendApiCalls)) {
          responseData.backendApiCalls.forEach(apiCall => {
            window.apiDebugConsole.log({
              method: apiCall.method,
              endpoint: apiCall.endpoint,
              status: apiCall.status,
              request: apiCall.request,
              response: apiCall.response,
              duration: apiCall.duration
            });
          });
        }
      }

      if (!response.ok) {
        // Error modal already shown by fetchWithErrorHandling
        // Return the error response for further handling
        return responseData;
      }

      return responseData;
    } catch (error) {
      // Network errors don't have backend API calls, so we skip logging
      throw error;
    }
  };

  // Backward compatible: replace global fetch with error-handling version
  // (optional - can be enabled by calling enableGlobalFetchWrapper())
  window.enableGlobalFetchWrapper = function() {
    window.fetch = window.fetchWithErrorHandling;
    console.log('Global fetch wrapper enabled - all fetch calls will now show error modals');
  };

  // Ensure window.apiCall exists even if there's an error
  if (typeof window.apiCall !== 'function') {
    console.error('Failed to initialize apiCall - using fallback');
    window.apiCall = async function(endpoint, options = {}) {
      const response = await fetch(endpoint, {
        method: options.method || 'POST',
        headers: { 'Content-Type': 'application/json', ...options.headers },
        body: options.body ? JSON.stringify(options.body) : undefined
      });
      return response.json();
    };
  }

  // Log that the wrapper is loaded
  console.log('✅ API Wrapper loaded. Use apiCall() or fetchWithErrorHandling() for automatic error handling.');
})();
