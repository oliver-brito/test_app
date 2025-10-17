

import express from "express";
import dotenv from "dotenv";
// --- HTTPS support (add this near the top of server.js) ---
import fs from "fs";
import https from "https";
// -----------------------------------------------------------

dotenv.config();

const app = express();
app.use(express.json({ limit: "1mb" }));

app.use((req, res, next) => {
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self';",
      // ✅ Permitir scripts tanto desde adyen.com como cdn.adyen.com
      "script-src 'self' 'unsafe-inline' https://*.adyen.com;",
      // ✅ Permitir estilos también desde ambos
      "style-src 'self' 'unsafe-inline' https://*.adyen.com;",
      // ✅ Permitir imágenes y fuentes desde Adyen
      "img-src 'self' data: https://*.adyen.com;",
      "font-src 'self' data: https://*.adyen.com;",
      // ✅ Permitir XHR/fetch a Adyen
      "connect-src 'self' https://*.adyen.com;",
      // ✅ Permitir iframes y hosted fields de Adyen
      "frame-src 'self' https://*.adyen.com;",
      "frame-ancestors 'self' https://*.adyen.com;",
      "child-src 'self' https://*.adyen.com;"
    ].join(" ")
  );

  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  next();
});


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
    const movePage = parseInt(_req.query.movePage);
    const method = movePage == 1 ? "nextPage" : movePage == -1 ? "prevPage" : "search";
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

// POST /map/availability/:performanceId  -> calls AV map.loadAvailability
app.post("/map/availability/:id", async (req, res) => {
  try {
    if (!CURRENT_SESSION) return res.status(401).json({ error: "Not authenticated" });
    if (!ORDER_PATH) return res.status(500).json({ error: "ORDER_PATH not configured" });

    const performanceId = req.params.id;
    const priceTypeId = req.body?.priceTypeId;
    const numSeats = req.body?.numSeats;

    const url = new URL(ORDER_PATH, API_BASE).toString();
    const payload = {
      actions: [
        {
          method: "getBestAvailable",
          params: {
            perfVector: [performanceId],
            reqRows: "1",
            [`reqNum::${priceTypeId}`]: String(numSeats),
            optNum: "2"
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
    console.error("Error in /map/availability:", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});



// POST /removeSeat -> Remove an admission by ID using manageAdmissions
app.post('/removeSeat', express.json(), async (req, res) => {
  try {
    if (!CURRENT_SESSION) return res.status(401).json({ error: "Not authenticated" });
    if (!ORDER_PATH) return res.status(500).json({ error: "ORDER_PATH not configured" });

    const { admissionId } = req.body || {};
    if (!admissionId) {
      return res.status(400).json({ error: "Missing admissionId" });
    }
    console.log(`Removing admission ID: ${admissionId}`);
    const url = new URL(ORDER_PATH, API_BASE).toString();
    const payload = {
      actions: [
        {
          method: "manageAdmissions",
          params: {
            removeAdmissionID: [admissionId]
          },
          acceptWarnings: [5414]
        }
      ],
      get: ["Order", "Admissions", "AvailablePaymentMethods", "DeliveryMethodDetails", "Seats"],
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
    const raw = await r.text();
    let data; try { data = JSON.parse(raw); } catch { data = raw; }
    if (!r.ok) {
      return res.status(r.status).json({ error: "Failed to remove admission", details: data });
    }
    res.json({ success: true, response: data });
    console.log(`Admission ID ${admissionId} removal response:`, raw);
  } catch (err) {
    console.error("Error in /removeSeat:", err);
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
          method: "loadBestAvailable",
          params: { performance_ids: [performanceId] }
        },
        {
          method: "loadAvailability",
          params: { performance_ids: [performanceId] }
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
    const pricetypes = data?.data?.pricetypes;
    if (!r.ok) return res.status(r.status).json({ error: "loadMap(pricing) failed", details: data });

    res.json({ pricetypes });
  } catch (err) {
    res.status(500).json({ error: String(err?.message || err) });
  }
});



// POST /transaction -> Process payment transaction via AudienceView API
app.post("/transaction", express.json(), async (req, res) => {
  try {
    if (!CURRENT_SESSION) return res.status(401).json({ error: "Not authenticated" });
    if (!ORDER_PATH) return res.status(500).json({ error: "ORDER_PATH not configured" });

    const { paymentData, orderData, paymentID } = req.body || {};
    console.log('Processing transaction with data:', { paymentData, orderData, paymentID });

    const url = new URL(ORDER_PATH, API_BASE).toString();

    // Use paymentID from request if provided, else default to "hola"
    const usedPaymentID = paymentID || "hola";

    // Call AudienceView order insert API
    const payload = {
      actions: [
        {
          method: "insert",
          params: {
            notification: "correspondence"
          },
          acceptWarnings: [
            5008,
            4224,
            5388
          ]
        }
      ],
      get: ["Order::order_number", "Payments"],
      objectName: "myOrder"
    };


    console.log('Calling AudienceView order insert with payload:', payload);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    // console.log('AudienceView response status:', response.status);
    console.log('AudienceView response text:', responseText);

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = responseText;
    }

    if (!response.ok) {
      console.error('AudienceView API error:', responseData);
      return res.status(response.status).json({
        success: false,
        error: "Transaction failed",
        details: responseData
      });
    }

    // Extract order information from response
    const orderNumber = responseData?.data?.["Order::order_number"]?.standard;
    const payments = responseData?.data?.Payments || {};
    
    // console.log('Transaction completed successfully');
    // console.log('Order number:', orderNumber);
    // console.log('Payments:', payments);

    // Generate mock transaction ID for display purposes
    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    // Redirect to success page with transaction details
    res.json({
      success: true,
      redirectUrl: `/viewOrder.html?orderId=${orderNumber || transactionId}&transactionId=${transactionId}`,
      transactionDetails: {
        success: true,
        transactionId: transactionId,
        orderId: orderNumber || transactionId,
        timestamp: new Date().toISOString(),
        paymentMethod: orderData?.paymentMethod || "Credit Card",
        status: "completed",
        audienceViewResponse: responseData
      }
    });

  } catch (err) {
    console.error("Error in /transaction:", err);
    res.status(500).json({ 
      success: false,
      error: String(err?.message || err) 
    });
  }
});

// GET /order -> Retrieve order details from AudienceView
app.get("/order", async (req, res) => {
  try {
    if (!CURRENT_SESSION) return res.status(401).json({ error: "Not authenticated" });
    if (!ORDER_PATH) return res.status(500).json({ error: "ORDER_PATH not configured" });

    const url = new URL(ORDER_PATH, API_BASE).toString();
    
    const payload = {
      get: ["Order", "Admissions"],
      objectName: "myOrder"
    };

    console.log('Fetching order details with payload:', payload);

    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      const pairs = parseSetCookieHeader(setCookie);
      CURRENT_COOKIES = mergeCookiePairs(CURRENT_COOKIES, pairs);
    }

    const responseText = await response.text();
    console.log('Order details response status:', response.status);
    console.log('Order details response text:', responseText);

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      responseData = responseText;
    }

    if (!response.ok) {
      console.error('AudienceView API error:', responseData);
      return res.status(response.status).json({
        error: "Failed to fetch order details",
        details: responseData
      });
    }

    // Extract order information from response
    const orderData = responseData?.data?.Order || {};
    
    console.log('Order details fetched successfully:', orderData);

    res.json({
      success: true,
      order: orderData,
      rawResponse: responseData,
      admissions: responseData?.data?.Admissions || {}
    });

  } catch (err) {
    console.error("Error in /order:", err);
    res.status(500).json({ 
      error: String(err?.message || err) 
    });
  }
});


app.get("/details", async (req, res) => {
  try {
    if (!CURRENT_SESSION) return res.status(401).json({ error: "Not authenticated" });
    if (!ORDER_PATH) return res.status(500).json({ error: "ORDER_PATH not configured" });
    const url = new URL(ORDER_PATH, API_BASE).toString();

    const payload = {
      get: ["Payments"],
      objectName: "myOrder"
    };

    console.log('Fetching payment details with payload:', payload);
    const r = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const raw = await r.text();
    let data;
    try { data = JSON.parse(raw); } catch { 
      // Always return JSON, even if parsing fails
      return res.status(500).json({ error: "Invalid JSON from upstream", raw });
    }
    if (!r.ok) {
      return res.status(r.status).json({ error: "Failed to fetch payment details", details: data });
    }

    res.json({
      success: true,
      payments: data?.data?.Payments || {},
      rawResponse: data
    });
    console.log(raw);

  } catch (err) {
    console.error("Error in /details:", err);
    res.status(500).json({
      error: String(err?.message || err)
    });
  }
});

// Real checkout endpoint: calls AV order API with addPayment
app.post("/checkout", express.json(), async (req, res) => {
  try {
    if (!CURRENT_SESSION) return res.status(401).json({ error: "Not authenticated" });
    if (!ORDER_PATH) return res.status(500).json({ error: "ORDER_PATH not configured" });

    const { deliveryMethod, paymentMethod } = req.body || {};
    const url = new URL(ORDER_PATH, API_BASE).toString();


    // Step 1: addCustomer
    const payloadCustomer = {
      actions: [
        {
          method: "addCustomer",
          params: {
            "Customer::customer_number": "1"
            // "Customer::customer_id": "7508E7EB-32FA-4CD2-BA08-D3CE427CAD70"
          }
        }
      ],
      get: ["Order::order_number", "Payments"],
      objectName: "myOrder"
    };
    console.log('Adding customer to order:', payloadCustomer);
    const rCustomer = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payloadCustomer)
    });
    const rawCustomer = await rCustomer.text();
    let dataCustomer; try { dataCustomer = JSON.parse(rawCustomer); } catch { dataCustomer = rawCustomer; }
    console.log('addCustomer response status:', rCustomer.status);
    console.log('addCustomer response:', dataCustomer);
    if (!rCustomer.ok) {
      return res.status(rCustomer.status).json({ error: "Checkout failed (addCustomer)", details: dataCustomer });
    }

    // Step 2: check Payments before addPayment
    const payloadCheckPayments = {
      get: ["Payments"],
      objectName: "myOrder"
    };
    const rCheckPayments = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payloadCheckPayments)
    });
    const rawCheckPayments = await rCheckPayments.text();
    let dataCheckPayments; try { dataCheckPayments = JSON.parse(rawCheckPayments); } catch { dataCheckPayments = rawCheckPayments; }
    let paymentsObj = dataCheckPayments?.data?.Payments || {};
    let hasPayment = false;
    for (const k in paymentsObj) {
      if (k === "state") continue;
      if (paymentsObj[k]?.payment_id?.standard) {
        hasPayment = true;
        break;
      }
    }

    let dataPayment;
    if (!hasPayment) {
      // Only add payment if none exists
      const payloadPayment = {
        actions: [
          {
            method: "addPayment"
          }
        ],
        get: ["Payments"],
        objectName: "myOrder"
      };
      const rPayment = await fetch(url, {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify(payloadPayment)
      });
      const rawPayment = await rPayment.text();
      try { dataPayment = JSON.parse(rawPayment); } catch { dataPayment = rawPayment; }
      if (!rPayment.ok) {
        return res.status(rPayment.status).json({ error: "Checkout failed (addPayment)", details: dataPayment });
      }
      paymentsObj = dataPayment?.data?.Payments || {};
    } else {
      // Use existing paymentsObj
      dataPayment = dataCheckPayments;
    }

    // Extract paymentID from Payments
    let paymentID = null;
    const payments = dataPayment?.data?.Payments || {};
    for (const [k, v] of Object.entries(payments)) {
      if (k === "state") continue;
      if (v?.payment_id?.standard) {
        paymentID = v.payment_id.standard;
        break;
      }
    }
    if (!paymentID) {
      return res.status(500).json({ error: "No paymentID found after addPayment", details: dataPayment });
    }

    // Step 2: set delivery and payment method
    const payload2 = {
      set: {
        "Order::deliverymethod_id": deliveryMethod,
        [`Payments::${paymentID}::active_payment`]: paymentMethod,
        // [`Payments::${paymentID}::swipe_indicator`]: "Internet",
        [`Payments::${paymentID}::cardholder_name`]: "Oliver Brito"
      },
      get: ["Order::order_number", "Payments"],
      objectName: "myOrder"
    };

    console.log('Setting delivery and payment method:', payload2.set);
    const r2 = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload2)
    });
    const raw2 = await r2.text();
    let data2; try { data2 = JSON.parse(raw2); } catch { data2 = raw2; }
    if (!r2.ok) {
      return res.status(r2.status).json({ error: "Checkout failed (set delivery/payment)", details: data2 });
    }

    // Step 3: getPaymentClientToken
    const payload3 = {
      actions: [
        {
          method: "getPaymentClientToken",
          params: { 
            payment_id: paymentID,
            pa_response_URL: "https://localhost:3443/checkout.html"
          }
        }
      ],
      get: ["Order::order_number", "Payments"],
      objectName: "myOrder"
    };
    const r3 = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload3)
    });
    const raw3 = await r3.text();
    let data3; try { data3 = JSON.parse(raw3); } catch { data3 = raw3; }
    const csp3 = r3.headers.get("content-security-policy");
    console.log(raw3);
    // Step 4: get Payments::payment_id
    const payload4 = {
      get: [ `Payments::${paymentID}` ],
      objectName: "myOrder"
    };
    const r4 = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload4)
    });
    const raw4 = await r4.text();
    let data4; try { data4 = JSON.parse(raw4); } catch { data4 = raw4; }
    // Return all steps for debugging
    res.json({ payment_details: data4.data?.[`Payments::${paymentID}`] });
  } catch (err) {
    console.error("Error in /checkout:", err);
    res.status(500).json({ error: String(err?.message || err) });
  }
});


app.post("/getPaymentClientConfig", async (req, res) => {
  // Handle POST request with payment context
  return handlePaymentConfig(req, res);
});

async function handlePaymentConfig(req, res) {
  try {
    const { paymentMethodId, eventId, paymentID } = req.body || {};
    
    console.log('Payment config requested with context:', {
      paymentMethodId,
      eventId, 
      paymentID
    });
    
    // Check if we have a payment method ID to work with
    if (!paymentMethodId) {
      console.warn('No paymentMethodId provided, using fallback config');
      return res.json({
        environment: 'test',
        clientKey: 'test_7REK4YQWRZB2DPRS7RNTFTGX2MPKY4SQ',
        countryCode: 'US',
        currency: 'USD'
      });
    }

    // Make the call to AudienceView paymentMethod API
    if (!CURRENT_SESSION) {
      console.warn('No active session, using fallback config');
      return res.json({
        environment: 'test',
        clientKey: 'test_7REK4YQWRZB2DPRS7RNTFTGX2MPKY4SQ',
        countryCode: 'US',
        currency: 'USD'
      });
    }

    const paymentMethodUrl = new URL('/app/WebAPI/v2/paymentMethod', API_BASE).toString();
    const payload = {
      actions: [
        {
          method: "getPaymentClientConfig",
          params: {
            payment_method_id: paymentMethodId
          },
          acceptWarnings: [4294]
        }
      ],
      objectName: "myPaymentMethod"
    };

    console.log('Calling AudienceView paymentMethod API:', paymentMethodUrl);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(paymentMethodUrl, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    console.log('PaymentMethod API response status:', response.status);
    console.log('PaymentMethod API response:', responseText);

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse paymentMethod API response:', e);
      responseData = responseText;
    }

    if (!response.ok) {
      console.error('PaymentMethod API error:', responseData);
      // Fall back to default config on API error
      return res.json({
        environment: 'test',
        clientKey: 'test_7REK4YQWRZB2DPRS7RNTFTGX2MPKY4SQ',
        countryCode: 'US',
        currency: 'USD',
        apiError: responseData
      });
    }

    // Extract the configuration from the AudienceView response structure
    try {
      const returnData = responseData?.return?.[0];
      if (returnData?.method === 'getPaymentClientConfig' && returnData?.values?.[0]?.name === 'result') {
        // Parse the JSON string in the result value
        const configJson = returnData.values[0].value;
        const parsedConfig = JSON.parse(configJson);
        const adyenConfig = parsedConfig?.config;
        
        console.log('Parsed Adyen config:', adyenConfig);
        
        if (adyenConfig) {
          // Extract Adyen configuration
          const clientConfig = {
            environment: adyenConfig.adyen_env || 'test',
            clientKey: adyenConfig.adyen_client_key || 'test_7REK4YQWRZB2DPRS7RNTFTGX2MPKY4SQ',
            countryCode: 'US', // Not provided in AV response, using default
            currency: 'USD',   // Not provided in AV response, using default
            showPayButton: adyenConfig.adyen_showpaybutton || false,
            hostedFieldUps: adyenConfig.hosted_field_ups || false,
            hostedPageUps: adyenConfig.hosted_page_ups || false,
            phoneServiceUps: adyenConfig.phone_service_ups || false,
            adyenGatewayType: adyenConfig.adyen_gateway_type || false,
            deviceFingerprint: adyenConfig.device_fingerprint || null,
            rawConfig: adyenConfig
          };
          
          return res.json(clientConfig);
        }
      }
      
      // If we can't parse the expected structure, log and fall back
      console.warn('Unexpected API response structure, using fallback config');
      console.warn('Response data:', responseData);
      
    } catch (parseError) {
      console.error('Error parsing AudienceView config response:', parseError);
    }
    
    // Fallback configuration
    res.json({
      environment: 'test',
      clientKey: 'test_7REK4YQWRZB2DPRS7RNTFTGX2MPKY4SQ',
      countryCode: 'US',
      currency: 'USD',
      apiResponse: responseData,
      fallback: true
    });
    
  } catch (err) {
    console.error("Error in handlePaymentConfig:", err);
    // Always fall back to working config on error
    res.json({
      environment: 'test',
      clientKey: 'test_7REK4YQWRZB2DPRS7RNTFTGX2MPKY4SQ',
      countryCode: 'US',
      currency: 'USD',
      error: String(err?.message || err)
    });
  }
}

app.post("/getPaymentResponse", async (req, res) => {
  try {
    const { paymentID } = req.body || {};
    
    console.log('Payment response requested for paymentID:', paymentID);
    
    // Check authentication
    if (!CURRENT_SESSION) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    
    if (!ORDER_PATH) {
      return res.status(500).json({ error: "ORDER_PATH not configured" });
    }

    // Check if we have a payment ID
    if (!paymentID) {
      return res.status(400).json({ 
        error: "Missing paymentID",
        message: "paymentID is required to fetch payment gateway config"
      });
    }

    const url = new URL(ORDER_PATH, API_BASE).toString();
    const payload = {
      get: [
        `Payments::${paymentID}::paymentmethod_gateway_config`
      ],
      objectName: "myOrder"
    };

    console.log('Calling AudienceView order API for payment response:', url);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    console.log('Payment response API status:', response.status);
    console.log('Payment response API response:', responseText);

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse payment response API response:', e);
      return res.status(500).json({ 
        error: "Invalid response from payment API",
        details: responseText
      });
    }

    if (!response.ok) {
      console.error('Payment response API error:', responseData);
      return res.status(response.status).json({
        error: "Failed to fetch payment gateway config",
        details: responseData
      });
    }

    // Extract the payment gateway configuration
    const gatewayConfig = responseData?.data?.[`Payments::${paymentID}::paymentmethod_gateway_config`];
    
    if (!gatewayConfig) {
      console.warn('No payment gateway config found in response');
      return res.status(404).json({
        error: "Payment gateway config not found",
        paymentID: paymentID,
        rawResponse: responseData
      });
    }

    console.log('Payment gateway config retrieved:', gatewayConfig);

    // Parse the payment methods from the JSON string in the standard field
    try {
      const paymentMethodsJson = gatewayConfig.standard || gatewayConfig.display || gatewayConfig.input;
      
      if (paymentMethodsJson) {
        const paymentMethodsConfig = JSON.parse(paymentMethodsJson);
        console.log('Parsed payment methods config:', paymentMethodsConfig);
        
        res.json({
          success: true,
          paymentID: paymentID,
          paymentMethodsResponse: paymentMethodsConfig,
          gatewayConfig: gatewayConfig,
          rawResponse: responseData
        });
      } else {
        console.warn('No payment methods JSON found in gateway config');
        res.json({
          success: true,
          paymentID: paymentID,
          gatewayConfig: gatewayConfig,
          rawResponse: responseData,
          warning: "No payment methods configuration found"
        });
      }
      
    } catch (parseError) {
      console.error('Error parsing payment methods JSON:', parseError);
      console.error('JSON string was:', gatewayConfig.standard);
      
      res.json({
        success: true,
        paymentID: paymentID,
        gatewayConfig: gatewayConfig,
        rawResponse: responseData,
        parseError: parseError.message
      });
    }

  } catch (err) {
    console.error("Error in /getPaymentResponse:", err);
    res.status(500).json({ 
      error: String(err?.message || err) 
    });
  }
});

// POST /processAdyenPayment -> Process Adyen payment data via AudienceView
app.post("/processAdyenPayment", async (req, res) => {
  try {
    if (!CURRENT_SESSION) return res.status(401).json({ error: "Not authenticated" });
    if (!ORDER_PATH) return res.status(500).json({ error: "ORDER_PATH not configured" });

    const { externalData, paymentID } = req.body || {};
    
    console.log('Processing Adyen payment with data:', { externalData, paymentID });
    
    if (!externalData) {
      return res.status(400).json({ 
        error: "Missing externalData",
        message: "externalData is required for Adyen payment processing"
      });
    }
    
    if (!paymentID) {
      return res.status(400).json({ 
        error: "Missing paymentID",
        message: "paymentID is required to identify the payment record"
      });
    }

    const url = new URL(ORDER_PATH, API_BASE).toString();
    
    // Set the external payment data in AudienceView
    const payload = {
      set: {
        [`Payments::${paymentID}::external_payment_data`]: externalData
      },
      objectName: "myOrder",
      get: ["Payments"]
    };

    console.log('Calling AudienceView order API to set external payment data:', url);
    console.log('Payload:', JSON.stringify(payload, null, 2));

    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });

    // Capture any cookies set by the endpoint
    const setCookie = response.headers.get("set-cookie");
    if (setCookie) {
      const pairs = parseSetCookieHeader(setCookie);
      CURRENT_COOKIES = mergeCookiePairs(CURRENT_COOKIES, pairs);
    }

    const responseText = await response.text();
    console.log('Adyen payment processing response status:', response.status);
    console.log('Adyen payment processing response:', responseText);

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      console.error('Failed to parse Adyen payment response:', e);
      return res.status(500).json({
        error: "Invalid response from payment API",
        details: responseText
      });
    }

    if (!response.ok) {
      console.error('Adyen payment API error:', responseData);
      return res.status(response.status).json({
        error: "Failed to process Adyen payment",
        details: responseData
      });
    }

    // Extract payments information from response
    const payments = responseData?.data?.Payments || {};
    const paymentRecord = payments[paymentID];
    
    // Check if external_payment_data was successfully set
    const externalPaymentDataSet = paymentRecord?.external_payment_data?.standard;
    const externalDataMatches = externalPaymentDataSet === externalData;
    
    console.log('Adyen payment processing completed');
    console.log('Expected external data:', externalData);
    console.log('Actual external data in response:', externalPaymentDataSet);
    console.log('External data set successfully:', externalDataMatches);

    if (!externalDataMatches) {
      return res.json({
        success: false,
        paymentID: paymentID,
        externalDataSet: false,
        expectedData: externalData,
        actualData: externalPaymentDataSet,
        payments: payments,
        message: "Adyen payment data verification failed - external data not set correctly",
        rawResponse: responseData
      });
    }

    // Step 2: If external data was set successfully, call the transaction endpoint to complete the payment
    console.log('External data verified successfully, proceeding to complete transaction...');
    
    const transactionPayload = {
      actions: [
        {
          method: "insert",
          params: {
            notification: "correspondence"
          },
          acceptWarnings: [
            5008,
            4224,
            5388
          ]
        }
      ],
      get: ["Order::order_number", "Payments"],
      objectName: "myOrder"
    };

    console.log('Calling AudienceView order insert to complete transaction:', transactionPayload);

    const transactionResponse = await fetch(url, {
      method: "POST",
      headers: {
        ...authHeaders(),
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(transactionPayload)
    });

    const transactionResponseText = await transactionResponse.text();
    console.log('Transaction completion response status:', transactionResponse.status);
    console.log('Transaction completion response:', transactionResponseText);

    let transactionData;
    try {
      transactionData = JSON.parse(transactionResponseText);
    } catch (e) {
      console.error('Failed to parse transaction completion response:', e);
      return res.status(500).json({
        success: false,
        error: "Invalid response from transaction completion",
        details: transactionResponseText,
        externalDataSet: true,
        paymentID: paymentID
      });
    }

    if (!transactionResponse.ok) {
      console.error('Transaction completion API error:', transactionData);
      return res.status(transactionResponse.status).json({
        success: false,
        error: "Failed to complete transaction after setting external data",
        details: transactionData,
        externalDataSet: true,
        paymentID: paymentID
      });
    }

    // Extract order information from transaction response
    const orderNumber = transactionData?.data?.["Order::order_number"]?.standard;
    const finalPayments = transactionData?.data?.Payments || {};
    
    console.log('Transaction completed successfully');
    console.log('Order number:', orderNumber);

    // Generate transaction ID for display purposes
    const transactionId = `TXN-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    res.json({
      success: true,
      paymentID: paymentID,
      externalDataSet: true,
      transactionCompleted: true,
      orderId: orderNumber,
      transactionId: transactionId,
      redirectUrl: `/viewOrder.html?orderId=${orderNumber || transactionId}&transactionId=${transactionId}`,
      transactionDetails: {
        success: true,
        transactionId: transactionId,
        orderId: orderNumber || transactionId,
        timestamp: new Date().toISOString(),
        paymentMethod: "Adyen",
        status: "completed",
        audienceViewResponse: transactionData
      },
      externalDataVerification: {
        expectedData: externalData,
        actualData: externalPaymentDataSet
      },
      payments: finalPayments,
      message: "Adyen payment processed and transaction completed successfully",
      rawTransactionResponse: transactionData
    });

  } catch (err) {
    console.error("Error in /processAdyenPayment:", err);
    res.status(500).json({ 
      error: String(err?.message || err) 
    });
  }
});

// --- Arranque HTTP + HTTPS ---
const httpPort  = process.env.PORT || 3000;
const httpsPort = process.env.HTTPS_PORT || 3443;
const httpsKey  = process.env.HTTPS_KEY;
const httpsCert = process.env.HTTPS_CERT;

if (httpsKey && httpsCert && fs.existsSync(httpsKey) && fs.existsSync(httpsCert)) {
  // Start HTTPS only
  const credentials = {
    key:  fs.readFileSync(httpsKey),
    cert: fs.readFileSync(httpsCert),
  };
  https.createServer(credentials, app).listen(httpsPort, () => {
    console.log(`HTTPS listening at https://localhost:${httpsPort}`);
  });
} else {
  // Start HTTP only
  app.listen(httpPort, () => {
    console.log(`HTTP listening at http://localhost:${httpPort}`);
  });
}
