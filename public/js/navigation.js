// Navigation functionality
(function() {
  'use strict';

  /**
   * Generate and inject navigation HTML into the page
   */
  function injectNavigation() {
    const container = document.getElementById('app-navigation');
    if (!container) {
      console.warn('Navigation container not found');
      return;
    }

    const navHTML = `
      <nav class="nav-container">
        <div class="nav-wrapper">
          <div class="navigation">
            <a href="index.html" class="nav-brand">
              <span class="nav-logo">🎭</span>
              <span>API Test App</span>
            </a>

            <button class="nav-toggle" id="nav-toggle" aria-label="Toggle menu">
              ☰
            </button>

            <div class="nav-filter">
              <select id="object-type-filter" class="nav-filter-select" aria-label="Filter by type">
                <option value="P">🎭 Performances</option>
                <option value="M">🎁 Miscellaneous</option>
                <option value="B">📦 Bundles</option>
                <option value="G">🎁 Gifts</option>
                <option value="S">💳 Stored Value</option>
                <option value="A">📄 Articles</option>
              </select>
            </div>

            <ul class="nav-menu" id="nav-menu">
              <li class="nav-item"><a href="myaccount.html" class="nav-link">My Account</a></li>
              <li class="nav-item"><a href="about.html" class="nav-link">About</a></li>
            </ul>

            <div class="nav-actions" id="nav-actions">
              <button class="nav-logout" id="nav-logout">Logout</button>
            </div>
          </div>
        </div>
      </nav>
    `;

    container.innerHTML = navHTML;
  }

  /**
   * Initialize navigation after DOM is loaded
   */
  function initNavigation() {
    // First inject the navigation HTML
    injectNavigation();
    const navToggle = document.getElementById('nav-toggle');
    const navMenu = document.getElementById('nav-menu');
    const navActions = document.getElementById('nav-actions');

    // Mobile menu toggle
    if (navToggle) {
      navToggle.addEventListener('click', function() {
        navMenu?.classList.toggle('active');
        navActions?.classList.toggle('active');
      });
    }

    // Close menu when clicking outside
    document.addEventListener('click', function(event) {
      if (!event.target.closest('.navigation')) {
        navMenu?.classList.remove('active');
        navActions?.classList.remove('active');
      }
    });

    // Highlight active page
    highlightActivePage();

    // Setup logout handler
    setupLogoutHandler();

    // Setup object type filter
    setupObjectTypeFilter();
  }

  /**
   * Setup object type filter for events page
   */
  function setupObjectTypeFilter() {
    const filterSelect = document.getElementById('object-type-filter');
    if (!filterSelect) return;

    // Load saved filter value
    const savedFilter = sessionStorage.getItem('av_object_type_filter') || 'P';
    filterSelect.value = savedFilter;

    // Handle filter change
    filterSelect.addEventListener('change', function() {
      const objectType = this.value;
      sessionStorage.setItem('av_object_type_filter', objectType);

      // Dispatch custom event for the events page to listen to
      window.dispatchEvent(new CustomEvent('objectTypeChanged', {
        detail: { objectType }
      }));
    });
  }

  /**
   * Get current object type filter
   */
  function getObjectTypeFilter() {
    return sessionStorage.getItem('av_object_type_filter') || 'P';
  }

  // Expose helper to window for use in other scripts
  window.getObjectTypeFilter = getObjectTypeFilter;

  /**
   * Highlight the current active page in navigation
   */
  function highlightActivePage() {
    const currentPath = window.location.pathname.split('/').pop() || 'index.html';
    const navLinks = document.querySelectorAll('.nav-link');

    navLinks.forEach(link => {
      const linkPath = link.getAttribute('href');
      if (linkPath === currentPath ||
          (currentPath === '' && linkPath === 'index.html') ||
          (currentPath === 'index.html' && linkPath === 'index.html')) {
        link.classList.add('active');
      }
    });
  }

  /**
   * Setup logout button handler
   */
  function setupLogoutHandler() {
    const logoutBtn = document.getElementById('nav-logout');
    if (!logoutBtn) return;

    logoutBtn.addEventListener('click', function(e) {
      e.preventDefault();

      // Clear session storage
      sessionStorage.removeItem('av_credentials');
      sessionStorage.removeItem('av_session');

      // Clear any other stored data
      localStorage.removeItem('deliveryMethod');
      localStorage.removeItem('paymentMethod');
      localStorage.removeItem('eventId');
      localStorage.removeItem('eventName');
      localStorage.removeItem('eventDate');

      // Redirect to login
      window.location.href = 'login.html';
    });
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavigation);
  } else {
    initNavigation();
  }

  console.log('✅ Navigation loaded');
})();
