// Helper functions extracted from event.html

function fallbackImage(src) {
  return src && src.trim() ? src : "av.webp";
}

function showError(msg) {
  $error.style.display = "";
  $error.textContent = msg;
}

function parseMoney(s) {
  if (s == null) return NaN;
  if (typeof s === "number") return s;
  return parseFloat(String(s).replace(/[^\d.]/g, ""));
}

function pricingMinMax(pricingObj) {
  if (!pricingObj || typeof pricingObj !== "object") return null;
  const rows = Object.entries(pricingObj).filter(([k]) => k !== "state").map(([, v]) => v);
  const amounts = [];
  for (const row of rows) {
    const std = row?.amounts?.standard;
    if (Array.isArray(std)) {
      for (const amt of std) {
        const n = parseMoney(amt);
        if (Number.isFinite(n)) amounts.push(n);
      }
    } else {
      const n = parseMoney(std);
      if (Number.isFinite(n)) amounts.push(n);
    }
  }
  if (!amounts.length) return null;
  return { min: Math.min(...amounts), max: Math.max(...amounts) };
}

function avText(node) {
  if (!node) return "";
  const v = node.display ?? node.standard ?? "";
  return Array.isArray(v) ? (v[0] ?? "") : v;
}

function avImg(...nodes) {
  for (const n of nodes) {
    const src = avText(n);
    if (src && String(src).trim()) return src;
  }
  return "";
}
