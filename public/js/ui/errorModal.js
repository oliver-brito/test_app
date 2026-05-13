// Error Modal System with collapsible request/response sections
// This module provides a global error modal that displays API call failures
// with prettified, collapsible JSON for both request and response

(function() {
  // Store the last error data so we can reopen the modal
  let lastErrorData = null;

  // Create modal HTML and inject into page
  function createErrorModal() {
    const modalHTML = `
      <!-- Floating error indicator icon -->
      <div id="error-indicator-icon" style="display:none; position:fixed; bottom:20px; right:20px; z-index:9998; cursor:pointer; background:#ef4444; color:#fff; width:56px; height:56px; border-radius:50%; box-shadow:0 4px 12px rgba(239,68,68,0.4); display:flex; align-items:center; justify-content:center; font-size:24px; transition:all 0.3s; animation:pulse 2s infinite;" onmouseover="this.style.transform='scale(1.1)'; this.style.boxShadow='0 6px 16px rgba(239,68,68,0.6)'" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 12px rgba(239,68,68,0.4)'" title="Click to view error details">
        ⚠️
        <span id="error-count-badge" style="position:absolute; top:-4px; right:-4px; background:#dc2626; color:#fff; font-size:11px; font-weight:700; padding:2px 6px; border-radius:10px; min-width:20px; text-align:center; box-shadow:0 2px 4px rgba(0,0,0,0.2);"></span>
      </div>

      <style>
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.7; }
        }
      </style>

      <div id="api-error-modal" style="display:none; position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.6); z-index:9999; align-items:center; justify-content:center;">
        <div style="background:#fff; width:85vw; max-width:1100px; max-height:85vh; margin:40px auto; border-radius:12px; box-shadow:0 4px 16px rgba(0,0,0,0.2); display:flex; flex-direction:column; overflow:hidden;">
          <!-- Header -->
          <div style="background:#ef4444; color:#fff; padding:20px 24px; display:flex; justify-content:space-between; align-items:center; border-radius:12px 12px 0 0;">
            <div>
              <h2 style="margin:0; font-size:1.5rem; font-weight:700;">API Call Failed</h2>
              <p id="error-modal-endpoint" style="margin:4px 0 0; opacity:0.9; font-size:0.875rem;"></p>
            </div>
            <button id="close-error-modal" style="background:rgba(255,255,255,0.2); color:#fff; border:none; border-radius:6px; padding:8px 16px; font-weight:600; cursor:pointer; font-size:1rem; transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.3)'" onmouseout="this.style.background='rgba(255,255,255,0.2)'">
              ✕ Close
            </button>
          </div>

          <!-- Content -->
          <div style="flex:1; overflow-y:auto; padding:24px;">
            <!-- Error Message -->
            <div id="error-modal-message" style="background:#fef2f2; border-left:4px solid #ef4444; color:#991b1b; padding:12px 16px; border-radius:6px; margin-bottom:20px; font-weight:500;"></div>

            <!-- Request Section -->
            <div style="margin-bottom:20px;">
              <div id="request-section-toggle" style="background:#f3f4f6; padding:12px 16px; border-radius:8px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; user-select:none; transition:background 0.2s;" onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='#f3f4f6'">
                <h3 style="margin:0; font-size:1.125rem; font-weight:600; color:#1f2937;">
                  <span id="request-toggle-icon" style="display:inline-block; width:20px; transition:transform 0.2s;">▶</span>
                  Request Details
                </h3>
                <span style="background:#3b82f6; color:#fff; padding:4px 10px; border-radius:4px; font-size:0.75rem; font-weight:600;">CLICK TO EXPAND</span>
              </div>
              <div id="request-content" style="display:none; background:#fafafa; border:1px solid #e5e7eb; border-top:none; border-radius:0 0 8px 8px; padding:16px; font-family:monospace; font-size:13px; overflow-x:auto;"></div>
            </div>

            <!-- Response Section -->
            <div>
              <div id="response-section-toggle" style="background:#f3f4f6; padding:12px 16px; border-radius:8px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; user-select:none; transition:background 0.2s;" onmouseover="this.style.background='#e5e7eb'" onmouseout="this.style.background='#f3f4f6'">
                <h3 style="margin:0; font-size:1.125rem; font-weight:600; color:#1f2937;">
                  <span id="response-toggle-icon" style="display:inline-block; width:20px; transition:transform 0.2s;">▶</span>
                  Response Details
                </h3>
                <span style="background:#3b82f6; color:#fff; padding:4px 10px; border-radius:4px; font-size:0.75rem; font-weight:600;">CLICK TO EXPAND</span>
              </div>
              <div id="response-content" style="display:none; background:#fafafa; border:1px solid #e5e7eb; border-top:none; border-radius:0 0 8px 8px; padding:16px; font-family:monospace; font-size:13px; overflow-x:auto;"></div>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Setup event listeners
    const modal = document.getElementById('api-error-modal');
    const closeBtn = document.getElementById('close-error-modal');
    const requestToggle = document.getElementById('request-section-toggle');
    const responseToggle = document.getElementById('response-section-toggle');
    const requestContent = document.getElementById('request-content');
    const responseContent = document.getElementById('response-content');
    const requestIcon = document.getElementById('request-toggle-icon');
    const responseIcon = document.getElementById('response-toggle-icon');
    const errorIcon = document.getElementById('error-indicator-icon');

    // Close button - hide modal and show floating icon
    closeBtn.onclick = () => {
      modal.style.display = 'none';
      if (lastErrorData && errorIcon) {
        errorIcon.style.display = 'flex';
      }
    };

    // Click outside to close
    modal.onclick = (e) => {
      if (e.target === modal) {
        modal.style.display = 'none';
        if (lastErrorData && errorIcon) {
          errorIcon.style.display = 'flex';
        }
      }
    };

    // Click floating icon to reopen modal
    if (errorIcon) {
      errorIcon.onclick = () => {
        if (lastErrorData) {
          modal.style.display = 'flex';
          errorIcon.style.display = 'none';
        }
      };
    }

    // Request section toggle
    requestToggle.onclick = () => {
      const isHidden = requestContent.style.display === 'none';
      requestContent.style.display = isHidden ? 'block' : 'none';
      requestIcon.textContent = isHidden ? '▼' : '▶';
    };

    // Response section toggle
    responseToggle.onclick = () => {
      const isHidden = responseContent.style.display === 'none';
      responseContent.style.display = isHidden ? 'block' : 'none';
      responseIcon.textContent = isHidden ? '▼' : '▶';
    };
  }

  // Render nested JSON with collapsible sections (like code editor)
  function renderCollapsibleJSON(obj, parent, level = 0) {
    // Handle primitives
    if (obj === null || obj === undefined) {
      const span = document.createElement('span');
      span.style.color = '#6b7280';
      span.textContent = String(obj);
      parent.appendChild(span);
      return;
    }

    if (typeof obj !== 'object') {
      const span = document.createElement('span');
      span.style.color = typeof obj === 'string' ? '#059669' : '#2563eb';
      span.style.fontWeight = '500';
      span.textContent = JSON.stringify(obj);
      parent.appendChild(span);
      return;
    }

    const isArray = Array.isArray(obj);
    const entries = Object.entries(obj);

    if (entries.length === 0) {
      const span = document.createElement('span');
      span.style.color = '#6b7280';
      span.textContent = isArray ? '[]' : '{}';
      parent.appendChild(span);
      return;
    }

    // Container for this object/array
    const container = document.createElement('div');
    container.style.marginLeft = level > 0 ? '20px' : '0';

    entries.forEach(([key, value], index) => {
      const itemContainer = document.createElement('div');
      itemContainer.style.marginBottom = '3px';

      const hasChildren = typeof value === 'object' && value !== null && Object.keys(value).length > 0;

      // Create toggle/key line
      const keyLine = document.createElement('div');
      keyLine.style.display = 'flex';
      keyLine.style.alignItems = 'flex-start';
      keyLine.style.gap = '6px';

      if (hasChildren) {
        // Toggle arrow
        const arrow = document.createElement('span');
        arrow.textContent = '▶';
        arrow.style.cursor = 'pointer';
        arrow.style.userSelect = 'none';
        arrow.style.color = '#6b7280';
        arrow.style.fontSize = '0.75rem';
        arrow.style.width = '12px';
        arrow.style.marginTop = '2px';

        const valueContainer = document.createElement('div');
        valueContainer.style.display = 'none';
        valueContainer.style.marginLeft = '18px';

        arrow.onclick = () => {
          const isCollapsed = valueContainer.style.display === 'none';
          valueContainer.style.display = isCollapsed ? 'block' : 'none';
          arrow.textContent = isCollapsed ? '▼' : '▶';
          arrow.style.color = isCollapsed ? '#2563eb' : '#6b7280';
        };

        keyLine.appendChild(arrow);

        // Key name
        const keySpan = document.createElement('span');
        keySpan.style.color = '#b45309';
        keySpan.style.fontWeight = '600';
        keySpan.style.cursor = 'pointer';
        keySpan.textContent = isArray ? `[${key}]` : `${key}:`;
        keySpan.onclick = arrow.onclick;
        keyLine.appendChild(keySpan);

        // Type indicator
        const typeSpan = document.createElement('span');
        typeSpan.style.color = '#6b7280';
        typeSpan.style.fontSize = '0.85rem';
        typeSpan.style.fontStyle = 'italic';
        const childCount = Object.keys(value).length;
        typeSpan.textContent = isArray ? `Array(${childCount})` : `Object{${childCount}}`;
        keyLine.appendChild(typeSpan);

        itemContainer.appendChild(keyLine);

        // Render children
        renderCollapsibleJSON(value, valueContainer, level + 1);
        itemContainer.appendChild(valueContainer);
      } else {
        // No children - just show key: value
        const keySpan = document.createElement('span');
        keySpan.style.color = '#b45309';
        keySpan.style.fontWeight = '600';
        keySpan.textContent = isArray ? `[${key}]` : `${key}:`;
        keyLine.appendChild(keySpan);

        const valueSpan = document.createElement('span');
        valueSpan.style.marginLeft = '6px';
        keyLine.appendChild(valueSpan);
        renderCollapsibleJSON(value, valueSpan, level + 1);

        itemContainer.appendChild(keyLine);
      }

      container.appendChild(itemContainer);
    });

    parent.appendChild(container);
  }

  // Track error count for badge
  let errorCount = 0;

  // Show error modal with request/response details
  window.showApiError = function(errorData) {
    // Ensure modal exists
    if (!document.getElementById('api-error-modal')) {
      createErrorModal();
    }

    // Store error data for reopening
    lastErrorData = errorData;
    errorCount++;

    const modal = document.getElementById('api-error-modal');
    const errorIcon = document.getElementById('error-indicator-icon');
    const errorCountBadge = document.getElementById('error-count-badge');
    const endpointEl = document.getElementById('error-modal-endpoint');
    const messageEl = document.getElementById('error-modal-message');
    const requestContent = document.getElementById('request-content');
    const responseContent = document.getElementById('response-content');

    // Update error count badge
    if (errorCountBadge) {
      errorCountBadge.textContent = errorCount;
    }

    // Set endpoint
    endpointEl.textContent = errorData.endpoint || 'Unknown endpoint';

    // Set error message
    const message = errorData.error || errorData.message || 'An error occurred';
    const statusText = errorData.status ? ` (HTTP ${errorData.status})` : '';
    messageEl.textContent = `${message}${statusText}`;

    // Render request details
    requestContent.innerHTML = '';
    if (errorData.request) {
      renderCollapsibleJSON(errorData.request, requestContent);
    } else {
      requestContent.innerHTML = '<span style="color:#6b7280;">No request data available</span>';
    }

    // Render response details
    responseContent.innerHTML = '';
    if (errorData.response) {
      renderCollapsibleJSON(errorData.response, responseContent);
    } else {
      responseContent.innerHTML = '<span style="color:#6b7280;">No response data available</span>';
    }

    // Reset sections to collapsed
    document.getElementById('request-content').style.display = 'none';
    document.getElementById('response-content').style.display = 'none';
    document.getElementById('request-toggle-icon').textContent = '▶';
    document.getElementById('response-toggle-icon').textContent = '▶';

    // Show modal and hide floating icon
    modal.style.display = 'flex';
    if (errorIcon) {
      errorIcon.style.display = 'none';
    }
  };

  // Allow clearing the error indicator
  window.clearErrorIndicator = function() {
    const errorIcon = document.getElementById('error-indicator-icon');
    if (errorIcon) {
      errorIcon.style.display = 'none';
    }
    lastErrorData = null;
    errorCount = 0;
  };

  // Initialize on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', createErrorModal);
  } else {
    createErrorModal();
  }

  // Log that the error modal is loaded
  console.log('✅ Error Modal loaded. Use showApiError() to display API errors.');
})();
