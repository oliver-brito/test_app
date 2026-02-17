// Index page - Events listing
(async function() {
  'use strict';

  const $status = document.getElementById("status");
  const $error = document.getElementById("error");
  const $list = document.getElementById("events");
  const $prevPage = document.getElementById("prevPage");
  const $nextPage = document.getElementById("nextPage");
  const $title = document.querySelector("h1");

  const objectTypeNames = {
    'P': 'Performances',
    'M': 'Miscellaneous Items',
    'B': 'Bundles',
    'G': 'Gifts',
    'S': 'Stored Value Items',
    'A': 'Articles'
  };

  /**
   * Fetch upcoming events from the API
   * @param {number} movePage - 1 (next), -1 (prev), or 0/undefined (initial)
   * @returns {Promise<Array>} Array of event objects
   */
  async function fetchEvents(movePage) {
    const objectType = window.getObjectTypeFilter ? window.getObjectTypeFilter() : 'P';
    const payload = await window.apiCall(`/events/upcoming?movePage=${movePage}&objectType=${objectType}`, {
      method: "GET"
    });

    if (payload?.response?.status >= 400) {
      console.error("Upcoming failed:", payload);
      throw new Error(`Upcoming failed: ${payload?.status} ${payload?.statusText || ""}`);
    }

    return payload.events;
  }

  /**
   * Helper function to add a field to the meta section
   * @param {HTMLElement} parent - Parent element to append to
   * @param {string} label - Field label
   * @param {string} value - Field value
   */
  function addField(parent, label, value) {
    if (!value) return; // Skip if no value
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = `${label}: ${value}`;
    parent.appendChild(p);
  }

  /**
   * Helper function to add a badge to the meta section
   * @param {HTMLElement} parent - Parent element to append to
   * @param {string} label - Badge label
   * @param {string} value - Badge value
   */
  function addBadge(parent, label, value) {
    if (!value) return; // Skip if no value
    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = `${label}: ${value}`;
    parent.appendChild(badge);
  }

  /**
   * Helper function to add a price range to the meta section
   * @param {HTMLElement} parent - Parent element to append to
   * @param {string} minPrice - Minimum price
   * @param {string} maxPrice - Maximum price
   */
  function addPriceRange(parent, minPrice, maxPrice) {
    if (!minPrice && !maxPrice) return;

    const p = document.createElement("p");
    p.className = "muted";

    if (minPrice && maxPrice && minPrice !== maxPrice) {
      p.textContent = `Price Range: ${minPrice} - ${maxPrice}`;
    } else if (minPrice || maxPrice) {
      p.textContent = `Price: ${minPrice || maxPrice}`;
    }

    parent.appendChild(p);
  }

  /**
   * Create an event card DOM element with type-aware rendering
   * @param {Object} event - Event data object
   * @returns {HTMLElement} Event card list item
   */
  function createEventItem(event) {
    const objectType = event.object_type?.standard || 'P';

    const li = document.createElement("li");
    li.className = "card";

    const img = document.createElement("img");
    img.className = "thumb";
    img.alt = event.name?.standard || "Item image";
    img.src = fallbackImage(event.image1?.standard || "");
    img.onerror = () => { img.src = "av.webp"; };

    const meta = document.createElement("div");
    meta.className = "meta";

    const h2 = document.createElement("h2");
    h2.className = "title";
    h2.textContent = event.name?.standard ?? "Untitled";

    meta.appendChild(h2);

    // Type-specific fields
    switch (objectType) {
      case 'P': // Performances
        addField(meta, "Start Date", event.start_date?.display);
        addField(meta, "End Date", event.end_date?.display);
        addField(meta, "Location", event.city?.standard);
        addBadge(meta, "Available Seats", event.availability_num?.standard);
        break;

      case 'M': // Miscellaneous Items
        addField(meta, "Category", event.category?.standard);
        addPriceRange(meta, event.min_price?.standard, event.max_price?.standard);
        addField(meta, "Description", event.short_description?.standard || event.description?.standard);
        break;

      case 'B': // Bundles
        addField(meta, "Type", event.type?.standard);
        addField(meta, "Description", event.short_description?.standard || event.description?.standard);
        break;

      case 'G': // Gifts
        addField(meta, "Type", event.type?.standard);
        addPriceRange(meta, event.min_price?.standard, event.max_price?.standard);
        addField(meta, "Description", event.short_description?.standard || event.description?.standard);
        break;

      case 'S': // Stored Value Items
        addField(meta, "Type", event.type?.standard);
        addPriceRange(meta, event.min_price?.standard, event.max_price?.standard);
        addField(meta, "Description", event.short_description?.standard || event.description?.standard);
        break;

      case 'A': // Articles
        addField(meta, "Type", event.type?.standard);
        addField(meta, "Sales Status", event.sales_status?.standard);
        addField(meta, "Description", event.short_description?.standard || event.description?.standard);
        break;
    }

    const buy = document.createElement("a");
    buy.className = "buy";
    buy.textContent = "Buy";
    buy.href = `event.html?id=${encodeURIComponent(event.id?.standard ?? "")}`;

    li.appendChild(img);
    li.appendChild(meta);
    li.appendChild(buy);

    return li;
  }

  /**
   * Update page title based on selected filter
   */
  function updatePageTitle() {
    const objectType = window.getObjectTypeFilter ? window.getObjectTypeFilter() : 'P';
    const typeName = objectTypeNames[objectType] || 'Events';
    if ($title) {
      $title.textContent = `${typeName}`;
    }
    document.title = `${typeName} - AudienceView`;
  }

  /**
   * Main function to load and render events
   * @param {number} movePage - Page navigation direction
   */
  async function loadEvents(movePage = 0) {
    // Check authentication and refresh server-side credentials
    if (!(await window.checkAndRefreshAuth())) {
      return; // Will redirect to login
    }

    // Update page title
    updatePageTitle();

    try {
      $status.textContent = "Loading…";
      const events = await fetchEvents(movePage);
      console.log(events);

      $list.innerHTML = "";

      if (!events || events.length === 0) {
        $list.insertAdjacentHTML("beforeend", `<li class="muted">No items found.</li>`);
      } else {
        for (const ev of events) {
          $list.appendChild(createEventItem(ev));
        }
      }

      $status.textContent = `${events?.length ?? 0} item(s)`;
    } catch (e) {
      console.error(e);
      $error.style.display = "";
      $error.textContent = "Couldn't load items. Please try again.";
      $status.textContent = "Error";
    }
  }

  // Event listeners for pagination
  $prevPage.addEventListener("click", () => loadEvents(-1));
  $nextPage.addEventListener("click", () => loadEvents(1));

  // Listen for object type filter changes
  window.addEventListener('objectTypeChanged', () => {
    loadEvents(0); // Reload from first page
  });

  // Load initial events
  loadEvents();
})();
