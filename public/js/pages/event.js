// Event details page entry.

import "../ui/errorModal.js";
import "../ui/apiDebugConsole.js";
import "../ui/navigation.js";
import { apiCall } from "../shared/api.js";
import { checkAndRefreshAuth } from "../shared/auth.js";
import { fallbackImage, avText, avImg } from "../shared/helpers.js";
import { setContext, getContext } from "../shared/checkoutContext.js";

const $title = document.getElementById("title");
const $image = document.getElementById("image");
const $desc = document.getElementById("desc");
const $start = document.getElementById("start");
const $end = document.getElementById("end");
const $venue = document.getElementById("venue");
const $city = document.getElementById("city");
const $avail = document.getElementById("avail");
const $price = document.getElementById("price");
const $error = document.getElementById("error");
const $seats = document.getElementById("seats");
const $num = document.getElementById("num");
const $pricetype = document.getElementById("pricetype");
const $pricetype_value = document.getElementById("pricetype_value");
const $best = document.getElementById("best");
const $checkout = document.getElementById("checkout");
const $reusePaymentLabel = document.getElementById("reuse-payment-label");
const $reusePayment = document.getElementById("reuse-payment");

const params = new URLSearchParams(location.search);
const eventId = params.get("id");

function showError(msg) {
  $error.style.display = "";
  $error.textContent = msg;
}

function renderEvent(ev) {
  $title.textContent = avText(ev.short_description) || avText(ev.name) || "Untitled event";
  const imgSrc = avImg(ev.logo1, ev.alternative_overview_image, ev.thumbnail, ev.app_image);
  $image.src = fallbackImage(imgSrc);
  $desc.textContent = avText(ev.description) || "";
  $start.textContent = avText(ev.start_date) || "—";
  $end.textContent = avText(ev.end_date) || "—";
  $venue.textContent = avText(ev.venue_short_description) || "—";
  $city.textContent = "—";
  $price.textContent = "—";
  $avail.textContent = avText(ev.total_seats) || "—";
}

function renderSeats(list) {
  $seats.innerHTML = "";
  const filtered = (list || []).filter((s) => String(s.state) === "24");
  if (filtered.length === 0) {
    $seats.insertAdjacentHTML("beforeend", `<li class="muted">No seats selected yet.</li>`);
    return;
  }
  for (const s of filtered) {
    const li = document.createElement("li");
    li.className = "seat";
    li.innerHTML = `
      <div>
        <div><strong>Row:</strong> ${s.row?.standard ?? "—"}</div>
        <div><strong>Seat:</strong> ${s.seat?.standard ?? "—"}</div>
        <div><strong>Aisle:</strong> ${s.aisle?.standard ?? "—"}</div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;">
        <strong>${s.net?.display ?? "—"}</strong>
        <button class="remove-seat-btn" title="Remove seat" style="background:#ef4444;color:#fff;border:none;border-radius:50%;width:28px;height:28px;font-weight:bold;font-size:16px;cursor:pointer;line-height:1;">&times;</button>
      </div>
    `;
    const btn = li.querySelector(".remove-seat-btn");
    if (btn) {
      btn.onclick = async function (e) {
        e.stopPropagation();
        if (!s.admission_id?.standard) {
          alert("No admission id found for this seat.");
          return;
        }
        const admissionId = s.admission_id.standard;
        try {
          await apiCall("/removeSeat", { body: { admissionId } });
          alert("Seat removal requested (id: " + admissionId + ").");
          refreshSeats();
        } catch (err) {
          alert("Error removing seat (id: " + admissionId + "): " + err.message);
        }
      };
    }
    $seats.appendChild(li);
  }
}

function admissionsToSeats(admissions) {
  return Object.entries(admissions || {})
    .filter(([k]) => k !== "state")
    .map(([, row]) => ({
      row: { standard: row?.row?.standard ?? "—" },
      seat: { standard: row?.seat?.standard ?? "—" },
      aisle: { standard: row?.aisle?.standard ?? "—" },
      net: { display: row?.net?.display ?? "" },
      admission_id: { standard: row?.admission_id?.standard ?? "" },
      state: row?.state,
    }));
}

async function refreshSeats() {
  try {
    const data = await apiCall("/order", { method: "GET" });
    const admissions = data?.rawResponse?.data?.Admissions || data?.admissions || {};
    renderSeats(admissionsToSeats(admissions));
  } catch (e) {
    showError("Could not refresh seats: " + e.message);
  }
}

async function loadEvent() {
  if (!eventId) {
    showError("Missing event id.");
    return;
  }
  try {
    const ev = await apiCall(`/events/${encodeURIComponent(eventId)}`, { method: "GET" });
    renderEvent(ev);
  } catch (e) {
    console.error(e);
    showError("Couldn't load event. Please try again.");
  }
}

async function getBestAvailable() {
  const n = Math.max(1, parseInt($num.value, 10) || 1);
  const priceTypeId = $pricetype.value;
  try {
    const data = await apiCall(`/map/availability/${encodeURIComponent(eventId)}`, {
      body: { numSeats: n, priceTypeId },
    });

    const admissions = data?.data?.Admissions || {};
    renderSeats(admissionsToSeats(admissions));
    $checkout.style.display = "";
    if ($reusePaymentLabel) $reusePaymentLabel.style.display = "flex";

    const $delivery = document.getElementById("delivery");
    const $payment = document.getElementById("payment");

    function populateSelect(select, options) {
      select.innerHTML = "";
      Object.entries(options).forEach(([id, opt]) => {
        if (id === "state") return;
        const el = document.createElement("option");
        el.value = id;
        el.textContent = opt?.name?.display || opt?.name?.standard || id;
        select.appendChild(el);
      });
      select.style.display = "";
    }

    populateSelect($delivery, data?.data?.DeliveryMethodDetails || {});
    populateSelect($payment, data?.data?.AvailablePaymentMethods || {});
  } catch (e) {
    console.error(e);
    showError("Couldn't load availability. Please try again.");
  }
}

async function populatePriceTypes() {
  $pricetype.innerHTML = "";
  if (!eventId) return;
  try {
    const data = await apiCall(`/map/pricing/${encodeURIComponent(eventId)}`, { body: {} });
    const pricetypes = data.pricetypes;
    if (pricetypes && typeof pricetypes === "object") {
      Object.entries(pricetypes).forEach(([id, pt]) => {
        if (id === "state") return;
        const name = pt?.name?.display || pt?.name?.standard || id;
        const opt = document.createElement("option");
        opt.value = id;
        opt.textContent = name;
        $pricetype.appendChild(opt);
      });
    }
    $pricetype_value.value = $pricetype.value || "";
  } catch {
    showError("Couldn't load price types. Please try again.");
  }
}

function handleCheckout(e) {
  e.preventDefault();
  const ctx = getContext();
  const $delivery = document.getElementById("delivery");
  const $payment = document.getElementById("payment");
  const deliveryMethod = $delivery?.value || ctx.deliveryMethod;
  const paymentMethod = $payment?.value || ctx.paymentMethod;
  if (!deliveryMethod || !paymentMethod) {
    showError("Please select a delivery and payment method.");
    return;
  }

  const eventName = document.getElementById("title").textContent || "Unknown Event";
  const eventDate = document.getElementById("start").textContent || "TBD";

  setContext({ eventId, eventName, eventDate, deliveryMethod, paymentMethod });

  const reusePayment = $reusePayment && $reusePayment.checked;
  const qs = new URLSearchParams({ eventId });
  if (reusePayment) qs.set("mode", "reusePayment");
  window.location.href = `checkout.html?${qs.toString()}`;
}

$pricetype.addEventListener("change", function () {
  $pricetype_value.value = $pricetype.value;
});
$best.addEventListener("click", getBestAvailable);
$checkout.addEventListener("click", handleCheckout);

(async function () {
  if (!(await checkAndRefreshAuth())) return;
  loadEvent();
  renderSeats([]);
  populatePriceTypes();
  if (new URLSearchParams(location.search).get("cancelled") === "true") {
    $checkout.style.display = "";
    if ($reusePaymentLabel) $reusePaymentLabel.style.display = "flex";
  }
})();
