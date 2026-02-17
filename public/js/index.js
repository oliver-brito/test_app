// Index page - Events listing
(async function() {
  'use strict';

  const $status = document.getElementById("status");
  const $error = document.getElementById("error");
  const $list = document.getElementById("events");
  const $prevPage = document.getElementById("prevPage");
  const $nextPage = document.getElementById("nextPage");

  /**
   * Fetch upcoming events from the API
   * @param {number} movePage - 1 (next), -1 (prev), or 0/undefined (initial)
   * @returns {Promise<Array>} Array of event objects
   */
  async function fetchEvents(movePage) {
    const payload = await window.apiCall(`/events/upcoming?movePage=${movePage}`, {
      method: "GET"
    });

    if (payload?.response?.status >= 400) {
      console.error("Upcoming failed:", payload);
      throw new Error(`Upcoming failed: ${payload?.status} ${payload?.statusText || ""}`);
    }

    return payload.events;
  }

  /**
   * Create an event card DOM element
   * @param {Object} event - Event data object
   * @returns {HTMLElement} Event card list item
   */
  function createEventItem(event) {
    const li = document.createElement("li");
    li.className = "card";

    const img = document.createElement("img");
    img.className = "thumb";
    img.alt = event.name?.standard || "Event image";
    img.src = fallbackImage(event.image1?.standard || "");
    img.onerror = () => { img.src = "av.webp"; };

    const meta = document.createElement("div");
    meta.className = "meta";

    const h2 = document.createElement("h2");
    h2.className = "title";
    h2.textContent = event.name?.standard ?? "Untitled event";

    const p1 = document.createElement("p");
    p1.className = "muted";
    p1.textContent = "Start Date: " + (event.start_date?.display ?? "—");

    const p2 = document.createElement("p");
    p2.className = "muted";
    p2.textContent = "End Date: " + (event.end_date?.display ?? "—");

    const p3 = document.createElement("p");
    p3.className = "muted";
    p3.textContent = "Location: " + (event.city?.standard ?? "—");

    const badge = document.createElement("span");
    badge.className = "badge";
    badge.textContent = "Available Seats: " + (event.availability_num?.standard ?? "—");

    const buy = document.createElement("a");
    buy.className = "buy";
    buy.textContent = "Buy";
    buy.href = `event.html?id=${encodeURIComponent(event.id?.standard ?? "")}`;

    meta.appendChild(h2);
    meta.appendChild(p1);
    meta.appendChild(p2);
    meta.appendChild(p3);
    meta.appendChild(badge);

    li.appendChild(img);
    li.appendChild(meta);
    li.appendChild(buy);

    return li;
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

    try {
      $status.textContent = "Loading events…";
      const events = await fetchEvents(movePage);
      console.log(events);

      $list.innerHTML = "";

      if (!events || events.length === 0) {
        $list.insertAdjacentHTML("beforeend", `<li class="muted">No upcoming events.</li>`);
      } else {
        for (const ev of events) {
          $list.appendChild(createEventItem(ev));
        }
      }

      $status.textContent = `${events?.length ?? 0} event(s)`;
    } catch (e) {
      console.error(e);
      $error.style.display = "";
      $error.textContent = "Couldn't load events. Please try again.";
      $status.textContent = "Error";
    }
  }

  // Event listeners for pagination
  $prevPage.addEventListener("click", () => loadEvents(-1));
  $nextPage.addEventListener("click", () => loadEvents(1));

  // Load initial events
  loadEvents();
})();
