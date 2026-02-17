// Login page functionality
(function() {
  'use strict';

  const $form = document.getElementById('loginForm');
  const $error = document.getElementById('error');
  const $loading = document.getElementById('loading');
  const $loginBtn = document.getElementById('loginBtn');
  const $sessionExpiredInfo = document.getElementById('sessionExpiredInfo');

  // Check if redirected due to session expiration
  const urlParams = new URLSearchParams(window.location.search);
  const sessionExpired = urlParams.get('session_expired') === 'true';
  const returnUrl = urlParams.get('return_url') || '/index.html';

  if (sessionExpired) {
    $sessionExpiredInfo.style.display = 'block';
  }

  /**
   * Toggle password visibility
   */
  window.togglePassword = function() {
    const $password = document.getElementById('password');
    const $toggle = document.querySelector('.password-toggle');
    if ($password.type === 'password') {
      $password.type = 'text';
      $toggle.textContent = '🙈 Hide';
    } else {
      $password.type = 'password';
      $toggle.textContent = '👁️ Show';
    }
  };

  /**
   * Load default credentials from backend
   */
  async function loadDefaultCredentials() {
    try {
      const response = await fetch('/auth/defaults');
      if (response.ok) {
        const defaults = await response.json();
        document.getElementById('apiBase').value = defaults.apiBase || '';
        document.getElementById('username').value = defaults.username || '';
        document.getElementById('password').value = defaults.password || '';
        document.getElementById('customerNumber').value = defaults.customerNumber || '1';
      }
    } catch (error) {
      console.warn('Could not load default credentials:', error);
    }
  }

  /**
   * Handle login form submission
   */
  $form.addEventListener('submit', async (e) => {
    e.preventDefault();
    $error.classList.remove('show');
    $error.textContent = '';
    $loading.classList.add('show');
    $loginBtn.disabled = true;

    const credentials = {
      apiBase: document.getElementById('apiBase').value.trim(),
      username: document.getElementById('username').value.trim(),
      password: document.getElementById('password').value,
      customerNumber: document.getElementById('customerNumber').value.trim()
    };

    try {
      // Use apiCall for better error handling and logging
      const data = await window.apiCall('/login', {
        method: 'POST',
        body: credentials,
        showErrorModal: true
      });

      if (data && data.session) {
        // Store credentials in sessionStorage
        sessionStorage.setItem('av_credentials', JSON.stringify(credentials));
        sessionStorage.setItem('av_session', JSON.stringify({
          session: data.session,
          version: data.version,
          username: credentials.username,
          customerNumber: credentials.customerNumber
        }));

        // Redirect back to original page or home
        window.location.href = returnUrl;
      } else {
        // Show error in inline error div
        $error.textContent = '❌ ' + (data?.error || 'Login failed');
        $error.classList.add('show');
      }
    } catch (error) {
      // Show error in inline error div
      $error.textContent = '❌ ' + error.message;
      $error.classList.add('show');
    } finally {
      $loading.classList.remove('show');
      $loginBtn.disabled = false;
    }
  });

  // Load defaults on page load
  loadDefaultCredentials();
})();
