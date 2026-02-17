// Authentication helper functions
// This module provides utilities for checking authentication

(function() {
  /**
   * Check if user is logged in
   * @returns {Promise<boolean>} - true if authenticated, false otherwise (will redirect to login)
   */
  window.checkAndRefreshAuth = async function() {
    const credentials = sessionStorage.getItem('av_credentials');
    const session = sessionStorage.getItem('av_session');

    if (!credentials || !session) {
      // No credentials stored, redirect to login
      const currentPath = window.location.pathname + window.location.search;
      const returnUrl = encodeURIComponent(currentPath);
      window.location.href = `/login.html?return_url=${returnUrl}`;
      return false;
    }

    return true;
  };

  console.log('✅ Auth helper loaded. Use checkAndRefreshAuth() to verify authentication.');
})();
