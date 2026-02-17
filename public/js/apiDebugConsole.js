// API Debug Console - VS Code style bottom panel for tracking API calls
// Shows a collapsible log of all API requests and responses

(function() {
  const STORAGE_KEY_LOGS = 'apiDebugConsole_logs';
  const STORAGE_KEY_VISIBLE = 'apiDebugConsole_visible';
  const MAX_LOGS = 50;

  // Load logs from sessionStorage
  let apiCallLogs = [];
  try {
    const savedLogs = sessionStorage.getItem(STORAGE_KEY_LOGS);
    if (savedLogs) {
      apiCallLogs = JSON.parse(savedLogs);
    }
  } catch (e) {
    console.warn('Failed to load saved API logs:', e);
  }

  // Load visibility state from sessionStorage
  let consoleVisible = false;
  try {
    const savedVisible = sessionStorage.getItem(STORAGE_KEY_VISIBLE);
    if (savedVisible !== null) {
      consoleVisible = savedVisible === 'true';
    }
  } catch (e) {
    console.warn('Failed to load console visibility state:', e);
  }

  let currentHeight = 300; // Default height in pixels

  // Create the debug console UI
  function createDebugConsole() {
    const consoleHTML = `
      <!-- Debug Console Panel -->
      <div id="api-debug-console" style="display:none; position:fixed; bottom:0; left:0; right:0; height:300px; background:#1e1e1e; color:#d4d4d4; border-top:1px solid #454545; z-index:9997; display:flex; flex-direction:column; font-family:'Consolas','Monaco','Courier New',monospace; font-size:13px;">
        <!-- Header Bar -->
        <div id="console-header" style="background:#2d2d2d; padding:8px 12px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #454545; cursor:ns-resize; user-select:none;">
          <div style="display:flex; align-items:center; gap:12px;">
            <span style="font-weight:600; color:#4ec9b0;">API Debug Console</span>
            <span id="call-count" style="color:#858585; font-size:11px;">0 calls</span>
          </div>
          <div style="display:flex; gap:8px;">
            <button id="clear-console-btn" style="background:transparent; color:#858585; border:1px solid #454545; border-radius:3px; padding:4px 10px; cursor:pointer; font-size:11px; transition:all 0.2s;" onmouseover="this.style.background='#3e3e3e'; this.style.color='#d4d4d4'" onmouseout="this.style.background='transparent'; this.style.color='#858585'" title="Clear all logs">
              Clear
            </button>
            <button id="toggle-console-btn" style="background:transparent; color:#858585; border:1px solid #454545; border-radius:3px; padding:4px 10px; cursor:pointer; font-size:11px; transition:all 0.2s;" onmouseover="this.style.background='#3e3e3e'; this.style.color='#d4d4d4'" onmouseout="this.style.background='transparent'; this.style.color='#858585'" title="Close console (Ctrl+\`)">
              ✕
            </button>
          </div>
        </div>

        <!-- Logs Container -->
        <div id="console-logs" style="flex:1; overflow-y:auto; padding:8px 0;">
          <div id="empty-state" style="display:flex; align-items:center; justify-content:center; height:100%; color:#858585; font-size:12px;">
            No API calls logged yet. Make an API request to see it here.
          </div>
        </div>
      </div>

      <!-- Toggle Button (always visible) -->
      <button id="show-console-btn" style="display:block; position:fixed; bottom:10px; left:10px; z-index:9996; background:#007acc; color:#fff; border:none; border-radius:4px; padding:8px 14px; cursor:pointer; font-size:12px; font-weight:600; box-shadow:0 2px 8px rgba(0,0,0,0.3); transition:all 0.2s; font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;" onmouseover="this.style.background='#005a9e'; this.style.transform='translateY(-2px)'; this.style.boxShadow='0 4px 12px rgba(0,0,0,0.4)'" onmouseout="this.style.background='#007acc'; this.style.transform='translateY(0)'; this.style.boxShadow='0 2px 8px rgba(0,0,0,0.3)'" title="Show API Debug Console (Ctrl+\`)">
        📊 Debug Console
        <span id="new-calls-badge" style="display:none; position:absolute; top:-6px; right:-6px; background:#f14c4c; color:#fff; font-size:10px; font-weight:700; padding:2px 6px; border-radius:10px; min-width:18px; text-align:center;"></span>
      </button>

      <style>
        #api-debug-console::-webkit-scrollbar,
        #console-logs::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }
        #api-debug-console::-webkit-scrollbar-track,
        #console-logs::-webkit-scrollbar-track {
          background: #1e1e1e;
        }
        #api-debug-console::-webkit-scrollbar-thumb,
        #console-logs::-webkit-scrollbar-thumb {
          background: #424242;
          border-radius: 5px;
        }
        #api-debug-console::-webkit-scrollbar-thumb:hover,
        #console-logs::-webkit-scrollbar-thumb:hover {
          background: #4e4e4e;
        }

        .log-entry {
          border-bottom: 1px solid #2d2d2d;
          transition: background 0.2s;
        }
        .log-entry:hover {
          background: #2a2a2a;
        }
        .log-header {
          padding: 8px 12px;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 10px;
          user-select: none;
        }
        .log-body {
          display: none;
          padding: 0 12px 12px 38px;
          border-top: 1px solid #2d2d2d;
          margin-top: 4px;
        }
        .method-badge {
          display: inline-block;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 10px;
          font-weight: 700;
          min-width: 40px;
          text-align: center;
        }
        .status-badge {
          display: inline-block;
          padding: 2px 6px;
          border-radius: 3px;
          font-size: 10px;
          font-weight: 700;
        }
        .section-toggle {
          background: #2d2d2d;
          border: 1px solid #454545;
          color: #d4d4d4;
          padding: 6px 10px;
          margin: 4px 0;
          border-radius: 3px;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 11px;
          transition: background 0.2s;
        }
        .section-toggle:hover {
          background: #3e3e3e;
        }
        .section-content {
          display: block;
          background: #252526;
          border: 1px solid #3e3e3e;
          border-radius: 3px;
          padding: 10px;
          margin: 4px 0 8px 0;
          font-size: 11px;
          max-height: 300px;
          overflow-y: auto;
        }
      </style>
    `;

    document.body.insertAdjacentHTML('beforeend', consoleHTML);

    const consolePanel = document.getElementById('api-debug-console');
    const showBtn = document.getElementById('show-console-btn');
    const toggleBtn = document.getElementById('toggle-console-btn');
    const clearBtn = document.getElementById('clear-console-btn');
    const header = document.getElementById('console-header');

    // Show/hide console
    showBtn.onclick = () => showConsole();
    toggleBtn.onclick = () => hideConsole();

    // Clear logs
    clearBtn.onclick = () => {
      apiCallLogs = [];
      sessionStorage.removeItem(STORAGE_KEY_LOGS);
      renderLogs();
      updateCallCount();
    };

    // Keyboard shortcut: Ctrl+` (like VS Code)
    document.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === '`') {
        e.preventDefault();
        toggleConsole();
      }
    });

    // Resizable panel
    let isResizing = false;
    let startY, startHeight;

    header.addEventListener('mousedown', (e) => {
      isResizing = true;
      startY = e.clientY;
      startHeight = currentHeight;
      document.body.style.cursor = 'ns-resize';
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isResizing) return;

      const deltaY = startY - e.clientY;
      const newHeight = Math.max(150, Math.min(window.innerHeight - 100, startHeight + deltaY));
      currentHeight = newHeight;
      consolePanel.style.height = newHeight + 'px';
    });

    document.addEventListener('mouseup', () => {
      if (isResizing) {
        isResizing = false;
        document.body.style.cursor = '';
      }
    });
  }

  // Render collapsible JSON with proper JSON syntax (like VS Code)
  function renderCollapsibleJSON(obj, level = 0) {
    if (obj === null || obj === undefined) {
      return `<span style="color:#569cd6;">${String(obj)}</span>`;
    }

    if (typeof obj !== 'object') {
      const color = typeof obj === 'string' ? '#ce9178' : typeof obj === 'number' ? '#b5cea8' : typeof obj === 'boolean' ? '#569cd6' : '#d4d4d4';
      return `<span style="color:${color};">${JSON.stringify(obj)}</span>`;
    }

    const isArray = Array.isArray(obj);
    const entries = Object.entries(obj);

    if (entries.length === 0) {
      return `<span style="color:#d4d4d4;">${isArray ? '[]' : '{}'}</span>`;
    }

    const uniqueId = 'json-' + Math.random().toString(36).substr(2, 9);
    const openBrace = isArray ? '[' : '{';
    const closeBrace = isArray ? ']' : '}';

    let html = `
      <span style="color:#d4d4d4;">${openBrace}</span>
      <span onclick="
        const content = document.getElementById('${uniqueId}');
        const ellipsis = document.getElementById('${uniqueId}-ellipsis');
        if (content.style.display === 'none') {
          content.style.display = 'block';
          ellipsis.style.display = 'none';
        } else {
          content.style.display = 'none';
          ellipsis.style.display = 'inline';
        }
      " style="cursor:pointer; user-select:none;">
        <span id="${uniqueId}-ellipsis" style="display:none; color:#858585; margin:0 4px;">...</span>
      </span>
      <div id="${uniqueId}" style="display:block;">
    `;

    entries.forEach(([key, value], index) => {
      const isLastEntry = index === entries.length - 1;

      html += '<div style="margin-left:16px;">';

      // Render key (for objects only)
      if (!isArray) {
        html += `<span style="color:#9cdcfe;">"${key}"</span><span style="color:#d4d4d4;">: </span>`;
      }

      // Render value
      html += renderCollapsibleJSON(value, level + 1);

      // Add comma if not last entry
      if (!isLastEntry) {
        html += '<span style="color:#d4d4d4;">,</span>';
      }

      html += '</div>';
    });

    html += `</div><span style="color:#d4d4d4;">${closeBrace}</span>`;

    return html;
  }

  // Save logs to sessionStorage
  function saveLogs() {
    try {
      sessionStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(apiCallLogs));
    } catch (e) {
      console.warn('Failed to save API logs to sessionStorage:', e);
    }
  }

  // Save visibility state to sessionStorage
  function saveVisibility(visible) {
    try {
      sessionStorage.setItem(STORAGE_KEY_VISIBLE, visible.toString());
    } catch (e) {
      console.warn('Failed to save console visibility state:', e);
    }
  }

  // Add a log entry
  function addLogEntry(logData) {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = {
      timestamp,
      method: logData.method || 'POST',
      endpoint: logData.endpoint,
      status: logData.status,
      request: logData.request,
      response: logData.response,
      duration: logData.duration || null
    };

    apiCallLogs.unshift(logEntry); // Add to beginning

    // Keep only last MAX_LOGS logs
    if (apiCallLogs.length > MAX_LOGS) {
      apiCallLogs = apiCallLogs.slice(0, MAX_LOGS);
    }

    // Save to sessionStorage
    saveLogs();

    renderLogs();
    updateCallCount();

    // Show badge on toggle button if console is hidden
    if (!consoleVisible) {
      const badge = document.getElementById('new-calls-badge');
      if (badge) {
        badge.style.display = 'block';
        badge.textContent = apiCallLogs.length;
      }
    }
  }

  // Render all logs
  function renderLogs() {
    const logsContainer = document.getElementById('console-logs');
    const emptyState = document.getElementById('empty-state');

    if (apiCallLogs.length === 0) {
      emptyState.style.display = 'flex';
      return;
    }

    emptyState.style.display = 'none';

    const logsHTML = apiCallLogs.map((log, index) => {
      const statusColor = log.status >= 200 && log.status < 300 ? '#4ec9b0' :
                          log.status >= 400 ? '#f48771' : '#ce9178';
      const methodColor = log.method === 'GET' ? '#4fc1ff' :
                          log.method === 'POST' ? '#b5cea8' :
                          log.method === 'PUT' ? '#dcdcaa' :
                          log.method === 'DELETE' ? '#f48771' : '#858585';

      const requestId = 'req-' + index;
      const responseId = 'res-' + index;

      // Extract action method from request body if available
      const actionMethod = log.request?.body?.actions?.[0]?.method;
      const logTitle = actionMethod
        ? `${actionMethod} <span style="color:#858585;">(${log.method} ${log.endpoint})</span>`
        : log.endpoint;

      return `
        <div class="log-entry">
          <div class="log-header" onclick="
            const body = this.nextElementSibling;
            const arrow = this.querySelector('.arrow');
            if (body.style.display === 'none' || !body.style.display) {
              body.style.display = 'block';
              arrow.textContent = '▼';
            } else {
              body.style.display = 'none';
              arrow.textContent = '▶';
            }
          ">
            <span class="arrow" style="color:#858585; font-size:10px; width:12px;">▶</span>
            <span class="method-badge" style="background:${methodColor}; color:#000;">${log.method}</span>
            <span style="color:#4ec9b0; flex:1;">${logTitle}</span>
            <span class="status-badge" style="background:${statusColor}; color:#000;">${log.status || 'N/A'}</span>
            <span style="color:#858585; font-size:11px;">${log.timestamp}</span>
          </div>
          <div class="log-body">
            <!-- Request Section -->
            <div class="section-toggle" onclick="
              const content = document.getElementById('${requestId}');
              const arrow = this.querySelector('.section-arrow');
              if (content.style.display === 'none') {
                content.style.display = 'block';
                arrow.textContent = '▼';
              } else {
                content.style.display = 'none';
                arrow.textContent = '▶';
              }
            ">
              <span><span class="section-arrow">▼</span> Request</span>
            </div>
            <div id="${requestId}" class="section-content" style="display:block;">
              ${log.request ? renderCollapsibleJSON(log.request) : '<span style="color:#6b7280;">No request data</span>'}
            </div>

            <!-- Response Section -->
            <div class="section-toggle" onclick="
              const content = document.getElementById('${responseId}');
              const arrow = this.querySelector('.section-arrow');
              if (content.style.display === 'none') {
                content.style.display = 'block';
                arrow.textContent = '▼';
              } else {
                content.style.display = 'none';
                arrow.textContent = '▶';
              }
            ">
              <span><span class="section-arrow">▼</span> Response</span>
            </div>
            <div id="${responseId}" class="section-content" style="display:block;">
              ${log.response ? renderCollapsibleJSON(log.response) : '<span style="color:#6b7280;">No response data</span>'}
            </div>
          </div>
        </div>
      `;
    }).join('');

    logsContainer.innerHTML = logsHTML + '<div id="empty-state" style="display:none; align-items:center; justify-content:center; height:100%; color:#858585; font-size:12px;">No API calls logged yet. Make an API request to see it here.</div>';
  }

  // Update call count
  function updateCallCount() {
    const callCount = document.getElementById('call-count');
    if (callCount) {
      callCount.textContent = `${apiCallLogs.length} call${apiCallLogs.length === 1 ? '' : 's'}`;
    }
  }

  // Show console
  function showConsole() {
    const consolePanel = document.getElementById('api-debug-console');
    const showBtn = document.getElementById('show-console-btn');
    const badge = document.getElementById('new-calls-badge');

    consolePanel.style.display = 'flex';
    showBtn.style.display = 'none';
    if (badge) badge.style.display = 'none';
    consoleVisible = true;
    saveVisibility(true);
  }

  // Hide console
  function hideConsole() {
    const consolePanel = document.getElementById('api-debug-console');
    const showBtn = document.getElementById('show-console-btn');

    consolePanel.style.display = 'none';
    showBtn.style.display = 'block';
    consoleVisible = false;
    saveVisibility(false);
  }

  // Toggle console
  function toggleConsole() {
    if (consoleVisible) {
      hideConsole();
    } else {
      showConsole();
    }
  }

  // Expose public API
  window.apiDebugConsole = {
    log: addLogEntry,
    show: showConsole,
    hide: hideConsole,
    toggle: toggleConsole,
    clear: () => {
      apiCallLogs = [];
      sessionStorage.removeItem(STORAGE_KEY_LOGS);
      renderLogs();
      updateCallCount();
    }
  };

  // Initialize console after DOM is ready
  function initializeConsole() {
    createDebugConsole();

    // Use setTimeout to ensure DOM is fully ready
    setTimeout(() => {
      // Render any saved logs and update count
      if (apiCallLogs.length > 0) {
        renderLogs();
      }
      // Always update count, even if 0
      updateCallCount();

      // Restore visibility state
      if (consoleVisible) {
        showConsole();
      }
    }, 0);
  }

  // Initialize on page load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeConsole);
  } else {
    initializeConsole();
  }

  console.log('✅ API Debug Console loaded. Press Ctrl+` to toggle, or use window.apiDebugConsole');
})();
