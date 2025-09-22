
import express from "express";
import dotenv from "dotenv";
// --- HTTPS support (add this near the top of server.js) ---
import fs from "fs";
import https from "https";
// -----------------------------------------------------------

dotenv.config();

const app = express();
app.use(express.json({ limit: "1mb" }));

// Add security headers including CSP
app.use((req, res, next) => {
  // Allow frames from any origin for hosted payment fields
  res.setHeader('Content-Security-Policy', 
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https: http:; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https: http:; " +
    "connect-src 'self' https: http:; " +
    "frame-src 'self' https: http:; " +
    "frame-ancestors 'self' https: http:; " +
    "child-src 'self' https: http:;"
  );
  
  // Additional security headers
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
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
    const { numSeats = 2 } = req.body?.numSeats;

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
      get: ["Order"],
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
      rawResponse: responseData
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
        [`Payments::${paymentID}::swipe_indicator`]: "Internet",
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
