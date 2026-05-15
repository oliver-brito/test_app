# How an API call moves through the app

This document traces one HTTP request from the browser's `apiCall()` to
av-avon and back, layer by layer. Every endpoint follows the same shape;
this is the map.

## The 30-second version

```
Browser                 Express server                       av-avon
─────────────────────────────────────────────────────────────────────
fetch(/x, body)  ──►  morgan → helmet → json → cookieParser
                    → runWithRequestContext()                      ▲
                    → route(/x)                                    │
                      → express.json + validate(Body)              │
                      → handler.run(input, ctx) ── av builder ─►──┘
                                  │                ◄──── data ─────
                                  │                + apiCallMetadata
                                  │                  (recorded into
                                  │                   AsyncLocalStorage)
                                  ▼
                              return { success, ... }
                                  │
                              handler factory
                                  │  ─ appends backendApiCalls
                                  ▼
                              res.json(...)
                                  ◄──── errorHandler (on throw) ───
                                        formats ApiError as JSON
```

## The lifecycle in detail

### 1. Browser — `apiCall(endpoint, options)`

Source: `public/js/shared/api.js`.

The frontend never `fetch`es directly. Every page-side network call goes
through `apiCall()`:

```js
import { apiCall } from "../shared/api.js";

const result = await apiCall("/transaction", {
  body: { paymentId },
});
```

`apiCall()`:
- adds `Content-Type: application/json` and `JSON.stringify`s the body
- delegates to `fetchWithErrorHandling()`, which:
  - auto-detects auth errors (status 401/403, `errorCode: 99`, "session expired" messages) and redirects to `login.html` with a `session_expired=true` flag
  - shows the floating error modal (`ui/errorModal.js`'s `showApiError`) on any non-2xx response, unless the caller passes `showErrorModal: false`
- parses the response as JSON, logs the `backendApiCalls` trail into the
  debug console (`ui/apiDebugConsole.js`), and returns the parsed body

So by the time `await apiCall(...)` resolves, the browser-side debug
panel already shows every av-avon call that the server made on this
request's behalf.

### 2. The middleware chain

Source: `server/app.js` `createApp()`.

The order matters:

```
morgan('dev')                      HTTP access log
  → helmet (security headers + CSP)
  → express.json({ limit: '1mb' })  parses application/json
  → cookie-parser                   parses inbound Cookie header
  → runWithRequestContext()         opens an AsyncLocalStorage frame
                                    with an empty apiCalls trail
  → express.static('public')        static assets
  → /loginRouter, /eventsRouter, ... /proxyRouter
  → errorHandler                    catches anything thrown
```

The AsyncLocalStorage frame is the key piece: every av-avon call made
during this request will push its `apiCallMetadata` into that frame's
`apiCalls` array (see `server/services/requestContext.js`). The handler
factory reads it back out at the end to attach `backendApiCalls` to the
response.

### 3. The route — `handler({ body, run })`

Source for the factory: `server/middleware/handler.js`.
Source for each endpoint: `server/routes/<area>.js`.

Every endpoint is a named const above a route table at the bottom of the
file:

```js
const getPaymentMethodType = handler({
  body: PaymentIdBody,          // zod schema from server/schemas/payments.js
  async run({ paymentId }) {
    const typeField = paymentField(paymentId, PAYMENT_FIELDS.PAYMENTMETHOD_TYPE);

    const { data } = await av
      .on(MY_ORDER)
      .get(typeField)
      .post(ORDER_PATH)
      .orFail("Failed to fetch payment method type");

    const paymentMethodType = unwrap(data, typeField);
    if (!paymentMethodType) {
      throw new ApiError(404, "Payment method type not found");
    }
    return { success: true, paymentId, paymentMethodType };
  },
});

router.post("/getPaymentMethodType", getPaymentMethodType);
```

What the factory does, in order:

1. If `body` is given, it mounts `express.json()` and `validate(body)`.
   Invalid bodies are rejected with a 400 before `run` is even called.
2. If `query` is given, it mounts `validate(query, "query")`.
3. It calls `run(input, { req, res })`:
   - `input` is `{ ...req.params, ...validated body, ...validated query }`
   - `ctx` is `{ req, res }`
4. If `run` returns a value, the factory writes `res.json({ ...value, backendApiCalls })`.
5. If `run` returns `undefined`, the factory does nothing (the handler
   already wrote the response — common when delegating to
   `redirectToViewOrder()` or `handleThreeDS()`).
6. If `run` throws, the error flows to `errorHandler`.

### 4. The `av` builder — `await av.on(...).get(...).post(P).orFail(M)`

Source: `server/services/av.js`.

Every server-side call to av-avon goes through this fluent builder.

```js
av                              // singleton root
  .on(MY_ORDER)                 // sets payload.objectName
  .get(field, field, ...)       // appends payload.get
  .set({ [field]: value })      // merges into payload.set
  .action(METHOD, params?, { acceptWarnings? })
                                // appends payload.actions
  .manual()                     // do not follow redirects
  .surfaceThreeDS()             // a 4294 response is NOT an error
  .post(PATH)                   // sets the target av-avon endpoint
  .orFail("message")            // throw ApiError on !response.ok
```

Each method returns a new (frozen) builder, so partial chains compose
cleanly. The builder is "thenable": awaiting it triggers execution.

**Two terminal modes:**

- `await av...post(P)` — returns `{ response, data, apiCallMetadata }` on
  success or failure. The caller checks `response.ok` and decides what
  to do.
- `await av...post(P).orFail(M)` — returns the same triple on success;
  throws `ApiError(response.status, M)` on failure. (When `.surfaceThreeDS()`
  is set, a 4294 response returns `{ ...result, requires3ds: true }` instead.)

### 5. The wire — `_execute(path, payload, opts)`

Also in `server/services/av.js`. Internal entry point. What it does:

1. Resolves the active av-avon base URL: `getApiBase()` (the one supplied
   at `/login`) or `process.env.API_BASE`.
2. Builds the request with `authHeaders()` — auto-attaches `Session` and
   `Cookie` from the session store.
3. `fetch(url, ...)`.
4. **Mirrors any inbound `Set-Cookie` back into the session store** via
   `mirrorSetCookies()` (services/cookieSync.js).
5. Parses the body as JSON (falling back to raw text — av-avon
   occasionally sends text on errors).
6. **Records the call's metadata into the AsyncLocalStorage trail** via
   `recordApiCall()`.
7. Returns `{ response, data, apiCallMetadata }`. If `orFailMessage` is
   set and `!response.ok`, throws `ApiError` with `details: data`.

### 6. Translation: camelCase ↔ snake_case

The API surface our endpoints expose uses **camelCase** for every field
name. av-avon uses **snake_case** and `X::Y` scoped paths. Translation
happens at one place: the av builder call inside the handler.

Reference catalogs:

- `server/av/objectNames.js` — `MY_ORDER`, `MY_CUSTOMER`, ...
- `server/av/methods.js` — `INSERT`, `ADD_CUSTOMER`, `GET_BEST_AVAILABLE`, ...
- `server/av/fields.js` — `ORDER_NUMBER`, `CUSTOMER_ID`, `paymentField(id, key)`, ...

The standard is: **if a string belongs to a category defined in `server/av/*.js`, it must be a constant, not a literal**.

### 7. Response shaping — the standard envelope

Source: `server/middleware/handler.js` for success, `server/middleware/errorHandler.js` for error.

**Success:**
```js
{
  success: true,
  ...domainFields,
  rawResponse?: <full av-avon body, when useful for the UI>,
  backendApiCalls?: [...]      // auto-attached by the handler factory
}
```

**Error** (thrown via `new ApiError(status, message, { code?, details? })`):
```js
{
  success: false,
  error,
  message,
  code?,
  status,
  endpoint?: <av-avon path that failed>,
  request?: { endpoint, payload, timestamp },
  response: <av-avon error body, same as details>,
  details: <av-avon error body>,
  backendApiCalls?: [...],
  debugInfo: { timestamp }
}
```

Routes never write `backendApiCalls` manually. The handler factory reads
the AsyncLocalStorage trail and appends it. The error handler does the
same on the error path.

## Worked example: `POST /transaction`

End to end. Frontend submits a hosted-fields payment.

### Browser

`public/js/flows/paymentFlow.js`:

```js
const result = await apiCall("/transaction", { body: payload });
```

Where `payload` is `{ paymentData, paymentId, orderData: {...} }`.

`apiCall()` POSTs `Content-Type: application/json` with the body, parses
the JSON response, logs `backendApiCalls` into the debug console, and
returns the result.

### Express middleware chain (server/app.js)

1. **morgan** logs `POST /transaction 200 142ms`.
2. **helmet** sets the CSP and other security headers.
3. **express.json()** parses the body.
4. **cookie-parser** parses any inbound cookies.
5. **runWithRequestContext** opens an AsyncLocalStorage frame.
6. The matching route fires:
   `app.use("/", paymentsRouter)` →
   `router.post("/transaction", postTransaction)`.

### The route (server/routes/payments.js)

```js
const postTransaction = handler({
  body: TransactionBody,
  async run({ paymentId }, { req, res }) {
    const { response, data } = await insertOrder();

    if (!response.ok) {
      if (classifyException(data) === "threeDS") {
        await handleThreeDS(req, res, { paymentId });
        return;
      }
      throw new ApiError(response.status, "Transaction failed", { details: data });
    }

    redirectToViewOrder({ /* ... */ }, res);
    return;
  },
});
```

Step by step:

1. The factory mounts `express.json()` and `validate(TransactionBody)`.
   If the body lacks `paymentId`, the request never reaches `run` — a
   400 with the zod issue is returned.
2. `run({ paymentId })` is called. `paymentId` is the validated string.
3. `insertOrder()` (server/services/order.js) builds the av call:
   ```js
   av.on(MY_ORDER)
     .action(INSERT, { notification: "correspondence" }, { acceptWarnings: [...] })
     .get(ORDER, ADMISSIONS, PAYMENTS, ORDER_NUMBER)
     .manual()
     .post(ORDER_PATH);
   ```
   Awaiting this returns `{ response, data, apiCallMetadata }`. The
   metadata has already been pushed into the request's AsyncLocalStorage
   trail.
4. If `!response.ok` and av-avon returned exception `4294`, the route
   delegates to `handleThreeDS()` which fetches the PA request fields
   and writes a 402 with the challenge inputs. `run` then returns
   `undefined` so the factory leaves the response alone.
5. If `!response.ok` for any other reason, `run` throws `ApiError(...)`.
   That throw flows to `errorHandler`, which writes:
   ```js
   { success: false, error: "Transaction failed", message, status, details, backendApiCalls, ... }
   ```
6. On success, the route delegates to `redirectToViewOrder()` (in
   server/services/order.js), which writes a 200 JSON containing
   `redirectUrl` + `transactionDetails`. `run` returns `undefined`.

### Browser receives

The success response looks like:
```js
{ success: true, redirectUrl: "/viewOrder.html?...", transactionDetails: {...} }
```

`paymentFlow.js` reads `result.redirectUrl` and navigates. The debug
console (Ctrl+\`) shows the single `insertOrder` av-avon call that the
server made.

## Where to look when something breaks

| Symptom | First place to look |
|---|---|
| 400 with `code: "VALIDATION_ERROR"` | Wrong field name or missing field. Check `server/schemas/<area>.js`. |
| 404 from a route | A `unwrap(data, FIELD)` returned undefined. Check `server/av/fields.js` for the constant. |
| 500 with `error: "API_BASE is not defined"` | No session, `.env` missing `API_BASE`. Login establishes the session. |
| 401 / browser bounces to `/login.html` | `apiCall()` saw an `errorCode: 99` or 401/403 in the response. Server-side, that's usually av-avon rejecting the cookie. |
| 4294 in the debug console | 3DS required. `classifyException(data)` returns `"threeDS"`. The route should delegate to `handleThreeDS()`. |
| Response missing `backendApiCalls` | The route used `res.json()` directly instead of `return`ing from `run`. The handler factory only auto-attaches when `run` returns a value. |
| Tests fail with "Cannot find package" after pulling | `npm install` — node_modules is gitignored. |
