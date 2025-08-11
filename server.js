import express from "express";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(express.static("public"));

const { API_BASE, AUTH_PATH, UNL_USER, UNL_PASSWORD, UPCOMING_PATH, MAP_PATH, PERFORMANCE_PATH, ORDER_PATH } = process.env;

if (!API_BASE || !AUTH_PATH || !UNL_USER || !UNL_PASSWORD) {
  console.error("Missing API_BASE, AUTH_PATH, UNL_USER, or UNL_PASSWORD in .env");
  process.exit(1);
}
if (!UPCOMING_PATH) {
  console.warn("UPCOMING_PATH not set in .env (needed for /events/upcoming)");
}

// In-memory auth
let CURRENT_SESSION = null;      // e.g., "437A-..."
let CURRENT_COOKIES = "";        // e.g., "session=437A-..."

// Helper to extract only name=value pairs from a cookie string (removes attributes)
function filterCookieHeader(cookieStr) {
  if (!cookieStr) return "";
  // Split on commas that start a new cookie (avoid commas inside Expires)
  const parts = cookieStr.split(/,(?=\s*[^;=]+=[^;]+)/g);
  // For each part, take only the name=value (first semicolon)
  return parts
    .map(p => p.split(";")[0].trim())
    .filter(Boolean)
    .join("; ");
}

function parseSetCookieHeader(setCookieStr) {
  if (!setCookieStr) return [];
  // split on commas that start a new cookie (avoid commas inside Expires)
  const parts = setCookieStr.split(/,(?=\s*[^;=]+=[^;]+)/g);
  return parts.map(p => p.split(";")[0].trim()).filter(Boolean); // keep only "name=value"
}

function mergeCookiePairs(existingHeader, newPairs) {
  // existingHeader: "a=1; b=2"
  const jar = new Map();
  (existingHeader ? existingHeader.split(";").map(s => s.trim()) : [])
    .filter(Boolean)
    .forEach(kv => { const [k, ...rest] = kv.split("="); jar.set(k, rest.join("=")); });

  newPairs.forEach(kv => {
    const [k, ...rest] = kv.split("=");
    jar.set(k, rest.join("="));
  });

  return Array.from(jar.entries()).map(([k, v]) => `${k}=${v}`).join("; ");
}

function authHeaders(extra = {}) {
  const base = {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
  };
  if (CURRENT_SESSION) base.Session = CURRENT_SESSION;
  if (CURRENT_COOKIES) base.Cookie = filterCookieHeader(CURRENT_COOKIES);
  return { ...base, ...extra };
}

// POST /login -> AudienceView auth; stores session + cookies
app.post("/login", async (_req, res) => {
  try {
    const url = new URL(AUTH_PATH, API_BASE).toString();
    const body = { userid: UNL_USER, password: UNL_PASSWORD };

    const r = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    // Read response text then parse (helps log bad JSON)
    const raw = await r.text();
    let data; try { data = JSON.parse(raw); } catch { data = raw; }

    if (!r.ok || !data?.session) {
      return res.status(r.status || 500).json({ error: "Auth failed", details: data });
    }

    // Save session
    CURRENT_SESSION = data.session;

    // Capture Set-Cookie from AV (Powerful when WAF / extra cookies are present)
    // Some Node fetch impls return a single header; others may fold it. Handle both.
    const setCookie = r.headers.get("set-cookie");
    if (setCookie) {
      // Keep everything (some envs need Cloudflare cookies, etc.)
      // But store only the name=value pairs for sending
      CURRENT_COOKIES = filterCookieHeader(setCookie);
    } else {
      // Many AV envs don’t return Set-Cookie on this call; synthesize it:
      CURRENT_COOKIES = `session=${CURRENT_SESSION}`;
    }

    res.json({ session: data.session, version: data.version });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// GET /events/upcoming -> calls UPCOMING_PATH with Session + Cookie
app.get("/events/upcoming", async (_req, res) => {
  try {
    if (!CURRENT_SESSION) return res.status(401).json({ error: "Not authenticated" });
    if (!UPCOMING_PATH)   return res.status(500).json({ error: "UPCOMING_PATH not configured" });

    const url = new URL(UPCOMING_PATH, API_BASE).toString();
    console.log("req", _req.query);
    const movePage = parseInt(_req.query.movePage);
    const method = movePage == 1 ? "nextPage" : movePage == -1 ? "prevPage" : "search";
    console.log("method", method, "movePage", movePage);
    const payload = {
      actions: [{ method: method }],
      set: {
        "SearchCriteria::object_type_filter": "P",
        "SearchCriteria::search_criteria": "",
        "SearchCriteria::search_from": "",
        "SearchCriteria::search_to": ""
      },
      get: [
        "SearchResultsInfo::total_records",
        "SearchResultsInfo::current_page",
        "SearchResultsInfo::total_pages",
        "SearchResults"
      ],
      objectName: "mySearchResults"
    };
    // ✅ correct headers: text/plain wins, plus Session + Cookie
    const requestOptions = {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    };
    console.log("requestOptions", requestOptions);
    const r = await fetch(url, requestOptions);

    // 🥐 capture & merge any cookies the endpoint sets (Cloudflare, etc.)
    const setCookie = r.headers.get("set-cookie");
    if (setCookie) {
      const pairs = parseSetCookieHeader(setCookie);
      // Merge, then filter to name=value pairs only
      CURRENT_COOKIES = filterCookieHeader(mergeCookiePairs(CURRENT_COOKIES, pairs));
    }

    const rawText = await r.text();
    let data; try { data = JSON.parse(rawText); } catch { data = rawText; }

    if (!r.ok) {
      console.error("[UPCOMING] status", r.status, r.statusText);
      console.error("[UPCOMING] body", data);
      return res.status(r.status).json({ error: "Upcoming failed", details: data });
    }

    // Some AV stacks return 200 with an error payload—guard that:
    if (data?.errorCode || /error/i.test(data?.message || "")) {
      console.error("[UPCOMING] soft error", data);
      return res.status(400).json({ error: "Upstream error", details: data });
    }

    const resultsObj = data?.data?.SearchResults || {};
    const events = Object.values(resultsObj);
    res.json({ events });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});


// Generic proxy that auto-injects Session + Cookie
app.post("/proxy", async (req, res) => {
  try {
    const { method = "GET", path = "/", headers = {}, body } = req.body || {};
    const url = new URL(path, API_BASE).toString();

    const sanitized = { ...headers };
    // Browser may not override our auth
    delete sanitized.Session;
    delete sanitized.session;
    delete sanitized.Cookie;
    delete sanitized.cookie;

    const out = await fetch(url, {
      method,
      headers: { ...authHeaders(), ...sanitized }, // <-- includes Cookie
      body: ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase())
        ? (typeof body === "string" ? body : JSON.stringify(body ?? {}))
        : undefined,
    });

    const text = await out.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }

    res.status(200).json({
      request: {
        url,
        method,
        headers: authHeaders(sanitized),
        body: body ?? null
      },
      response: {
        status: out.status,
        statusText: out.statusText,
        headers: Object.fromEntries(out.headers.entries()),
        data
      }
    });
  } catch (e) {
    res.status(500).json({ error: String(e?.message || e) });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Demo UI at http://localhost:${port}`));


// POST /map/availability/:performanceId  -> calls AV map.loadAvailability
app.post("/map/availability/:id", async (req, res) => {
  try {
    if (!CURRENT_SESSION) return res.status(401).json({ error: "Not authenticated" });
    if (!ORDER_PATH) return res.status(500).json({ error: "ORDER_PATH not configured" });

    const performanceId = req.params.id;
    const priceTypeId = req.body?.priceTypeId;
    const { numSeats = 2 } = req.body?.numSeats;

    const url = new URL(ORDER_PATH, API_BASE).toString();
    const payload = {
      actions: [
        {
          method: "getBestAvailable",
          params: {
            perfVector: [performanceId],
            reqRows: "1",
            [`reqNum${priceTypeId}`]: String(numSeats)
          }
        }
      ],
      get: ["Admissions", "AvailablePaymentMethods", "DeliveryMethodDetails"],
      objectName: "myOrder"
    };

    const r = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const setCookie = r.headers.get("set-cookie");
    if (setCookie) {
      const pairs = parseSetCookieHeader(setCookie);
      CURRENT_COOKIES = mergeCookiePairs(CURRENT_COOKIES, pairs);
    }

    const raw = await r.text();
    let data; try { data = JSON.parse(raw); } catch { data = raw; }

    if (!r.ok) {
      return res.status(r.status).json({ error: "getBestAvailable failed", details: data });
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// GET /events/:id  -> calls PERFORMANCE_PATH with Session + Cookie
// method call is PERFORMANCE_PATH
// GET /events/:id -> AV performance.load
app.get("/events/:id", async (req, res) => {
  try {
    if (!CURRENT_SESSION) return res.status(401).json({ error: "Not authenticated" });

    const performanceId = req.params.id;
    const url = new URL(PERFORMANCE_PATH, API_BASE).toString();

    const payload = {
      actions: [
        {
          method: "load",
          params: { Performance: { performance_id: performanceId } }
        }
      ],
      get: ["Performance"]
    };

    const r = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    // merge any cookies the endpoint sets
    const setCookie = r.headers.get("set-cookie");
    if (setCookie) {
      const pairs = parseSetCookieHeader(setCookie);
      CURRENT_COOKIES = mergeCookiePairs(CURRENT_COOKIES, pairs);
    }

    const raw = await r.text();
    let data; try { data = JSON.parse(raw); } catch { data = raw; }

    if (!r.ok) {
      return res.status(r.status).json({ error: "performance.load failed", details: data });
    }

    // AV usually returns { data: { Performance: {...fields...} } }
    const perf = data?.data?.Performance;
    if (!perf) {
      return res.status(404).json({ error: "Performance not found", details: data });
    }

    // return the object as-is; your front-end expects { name: {standard}, ... }
    res.json(perf);
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});

// POST /map/pricing/:id -> AV map.loadMap (get pricing only)
app.post("/map/pricing/:id", async (req, res) => {
  try {
    if (!CURRENT_SESSION) return res.status(401).json({ error: "Not authenticated" });
    if (!MAP_PATH) return res.status(500).json({ error: "MAP_PATH not configured" });

    const performanceId = req.params.id;
    const { promocode_access_code = "" } = req.body || {};
    const url = new URL(MAP_PATH, API_BASE).toString();

    const payload = {
      actions: [
        {
          method: "loadMap",
          params: { performance_ids: [performanceId], promocode_access_code }
        }
      ],
      get: ["pricetypes"]
    };

    const r = await fetch(url, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json", "Accept": "application/json" },
      body: JSON.stringify(payload)
    });

    const setCookie = r.headers.get("set-cookie");
    if (setCookie) {
      const pairs = parseSetCookieHeader(setCookie);
      CURRENT_COOKIES = mergeCookiePairs(CURRENT_COOKIES, pairs);
    }

    const raw = await r.text();
    let data; try { data = JSON.parse(raw); } catch { data = raw; }

    if (!r.ok) return res.status(r.status).json({ error: "loadMap(pricing) failed", details: data });

    res.json(data); // pass through
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});
