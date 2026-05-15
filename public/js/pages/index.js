// Index page — events listing.

import "../ui/errorModal.js";
import "../ui/apiDebugConsole.js";
import "../ui/navigation.js";
import { apiCall } from "../shared/api.js";
import { checkAndRefreshAuth } from "../shared/auth.js";
import { fallbackImage } from "../shared/helpers.js";

const $status = document.getElementById("status");
const $error = document.getElementById("error");
const $list = document.getElementById("events");
const $prevPage = document.getElementById("prevPage");
const $nextPage = document.getElementById("nextPage");
const $title = document.querySelector("h1");

const objectTypeNames = {
  P: "Performances",
  M: "Miscellaneous Items",
  B: "Bundles",
  G: "Gifts",
  S: "Stored Value Items",
  A: "Articles",
};

async function fetchEvents(movePage) {
  const objectType = typeof window.getObjectTypeFilter === "function" ? window.getObjectTypeFilter() : "P";
  const payload = await apiCall(`/events/upcoming?movePage=${movePage}&objectType=${objectType}`, {
    method: "GET",
  });

  if (payload?.response?.status >= 400) {
    console.error("Upcoming failed:", payload);
    throw new Error(`Upcoming failed: ${payload?.status} ${payload?.statusText || ""}`);
  }
  return payload.events;
}

function addField(parent, label, value) {
  if (!value) return;
  const p = document.createElement("p");
  p.className = "muted";
  p.textContent = `${label}: ${value}`;
  parent.appendChild(p);
}

function addBadge(parent, label, value) {
  if (!value) return;
  const badge = document.createElement("span");
  badge.className = "badge";
  badge.textContent = `${label}: ${value}`;
  parent.appendChild(badge);
}

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

function createEventItem(event) {
  const objectType = event.object_type?.standard || "P";

  const li = document.createElement("li");
  li.className = "card";

  const img = document.createElement("img");
  img.className = "thumb";
  img.alt = event.name?.standard || "Item image";
  img.src = fallbackImage(event.image1?.standard || "");
  img.onerror = () => {
    img.src = "av.webp";
  };

  const meta = document.createElement("div");
  meta.className = "meta";

  const h2 = document.createElement("h2");
  h2.className = "title";
  h2.textContent = event.name?.standard ?? "Untitled";
  meta.appendChild(h2);

  switch (objectType) {
    case "P":
      addField(meta, "Start Date", event.start_date?.display);
      addField(meta, "End Date", event.end_date?.display);
      addField(meta, "Location", event.city?.standard);
      addBadge(meta, "Available Seats", event.availability_num?.standard);
      break;
    case "M":
      addField(meta, "Category", event.category?.standard);
      addPriceRange(meta, event.min_price?.standard, event.max_price?.standard);
      addField(meta, "Description", event.short_description?.standard || event.description?.standard);
      break;
    case "B":
      addField(meta, "Type", event.type?.standard);
      addField(meta, "Description", event.short_description?.standard || event.description?.standard);
      break;
    case "G":
    case "S":
      addField(meta, "Type", event.type?.standard);
      addPriceRange(meta, event.min_price?.standard, event.max_price?.standard);
      addField(meta, "Description", event.short_description?.standard || event.description?.standard);
      break;
    case "A":
      addField(meta, "Type", event.type?.standard);
      addField(meta, "Sales Status", event.sales_status?.standard);
      addField(meta, "Description", event.short_description?.standard || event.description?.standard);
      break;
  }

  const buy = document.createElement("a");
  buy.className = "buy";
  buy.textContent = "Buy";
  buy.href = `event.html?id=${encodeURIComponent(event.id?.standard ?? "")}`;

  li.append(img, meta, buy);
  return li;
}

function updatePageTitle() {
  const objectType = typeof window.getObjectTypeFilter === "function" ? window.getObjectTypeFilter() : "P";
  const typeName = objectTypeNames[objectType] || "Events";
  if ($title) $title.textContent = typeName;
  document.title = `${typeName} - AudienceView`;
}

async function loadEvents(movePage = 0) {
  if (!(await checkAndRefreshAuth())) return;

  updatePageTitle();

  try {
    $status.textContent = "Loading…";
    const events = await fetchEvents(movePage);
    $list.innerHTML = "";

    if (!events || events.length === 0) {
      $list.insertAdjacentHTML("beforeend", `<li class="muted">No items found.</li>`);
    } else {
      for (const ev of events) $list.appendChild(createEventItem(ev));
    }
    $status.textContent = `${events?.length ?? 0} item(s)`;
  } catch (e) {
    console.error(e);
    $error.style.display = "";
    $error.textContent = "Couldn't load items. Please try again.";
    $status.textContent = "Error";
  }
}

$prevPage.addEventListener("click", () => loadEvents(-1));
$nextPage.addEventListener("click", () => loadEvents(1));
window.addEventListener("objectTypeChanged", () => loadEvents(0));

loadEvents();
