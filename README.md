# test_app

A demo Node/Express app that exercises the AudienceView (av-avon) API end-to-end
through the browser: login → events listing → seat selection → checkout →
Adyen Drop-in (with 3DS challenge) → order confirmation. Used as a sandbox
to reproduce payment-flow scenarios that are hard to repro inside the full
AudienceView UI.

## Setup

```bash
# 1. Generate localhost certs (or use ngrok)
./generate_certs.ps1

# 2. Install dependencies
npm install

# 3. Configure .env at the project root
#    API_BASE=https://<your-avon>
#    UNL_USER=<user>
#    UNL_PASSWORD=<pass>
#    PORT=3000
#    HTTPS_PORT=3443

# 4. Run with auto-reload
npm run dev
```

Then open **https://localhost:3443**.

| Script              | What it does                                        |
| ------------------- | --------------------------------------------------- |
| `npm start`         | Run the server once.                                |
| `npm run dev`       | Run with `nodemon` (auto-restart on server edits).  |
| `npm test`          | Run the vitest suite.                               |
| `npm run lint`      | ESLint over `server/` and `public/js/`.             |
| `npm run format`    | Prettier write-mode.                                |

## Architecture in 5 minutes

```
┌──────────────────┐   fetch /xxx   ┌──────────────────┐  POST   ┌──────────┐
│  Browser         │ ─────────────► │  Express server  │ ──────► │ av-avon  │
│  public/js/...   │                │  server/...      │         └──────────┘
└──────────────────┘ ◄───────────── └──────────────────┘
   ES modules                          Express 5 + zod
```

**Request flow:**
1. A page (`public/<page>.html`) loads one ES module entry (`public/js/pages/<page>.js`).
2. The entry imports `shared/api.js`, calls `apiCall("/something", { body })`.
3. The Express route in `server/routes/<area>.js` validates the body with a
   zod schema (`server/schemas/`), then calls a service in `server/services/`.
4. The service uses `makeApiCallWithErrorHandling` from `server/utils/common.js`
   to talk to av-avon, automatically forwarding cookies + session.
5. On success → JSON. On 4294 → 3DS challenge flow. On any thrown error →
   `server/middleware/errorHandler.js` returns a structured JSON error.

### Backend layout

```
server/
  index.js                    bootstrap (binds the port)
  app.js                      createApp() — used by index.js and tests
  config/
    env.js                    loads + validates .env
    security.js               helmet CSP for Adyen/Google/Apple/Cardinal
    https.js                  async cert loading
  middleware/
    errorHandler.js           central 4-arg error handler + ApiError class
    validate.js               zod body-validation middleware factory
  routes/                     one router per area; thin handlers
  schemas/                    zod schemas applied to each route
  services/
    apiClient.* (in utils/common.js)
    apiErrors.js              classifyException → 'threeDS' | 'cancelled' | 'other'
    order.js                  insertOrder, redirectToViewOrder
    threeDSChallenge.js       handleThreeDS (issues the 402 challenge)
    checkout/
      context.js              per-request ctx with auto apiCalls collection
      getCustomerId.js
      addCustomer.js
      ensurePayment.js
      setDeliveryAndPayment.js
      getClientToken.js
      getPaymentDetails.js
      orchestrator.js         composes the 6 steps; replaces the old 130-line procedure
  constants.js                exception codes, accepted warnings, cardholder name
  utils/
    common.js                 sendCall + makeApiCall + cookie handling
    authHeaders.js, cookieUtils.js, sessionStore.js, debug.js
```

### Frontend layout

```
public/
  <page>.html                 each page loads one <script type="module">
  js/
    endpoints.js              shared route-name constants (imported by server too)
    pages/                    one entry per HTML page
    flows/
      paymentFlow.js          handleSubmit → /transaction → 3DS? → redirect
      threeDS.js              Cardinal iframe + postMessage handler
    ui/
      submitUI.js             submit button state + error/success banners
      checkoutDom.js          renders the checkout summary panel
      errorModal.js           floating API-error modal
      apiDebugConsole.js      bottom-panel API call log (Ctrl+`)
      navigation.js           top nav + logout + object-type filter
    shared/
      api.js                  apiCall() wrapper with auto error/log handling
      auth.js                 checkAndRefreshAuth()
      checkoutContext.js      sessionStorage-backed cross-page state
      helpers.js, detailsModal.js
    adyen/
      adyenApi.js             /processAdyenPayment etc. helpers
      adyenDropin.js          renderAdyenDropIn + 3DS URL return handler
      hostedFields.js         AvHostedInputSDK wrapper
```

## How to add things

### A new route

1. Create or open `server/routes/<area>.js`.
2. Write a zod schema in `server/schemas/<area>.js`.
3. Mount the route on its router with `validate(MySchema)`:
   ```js
   import { validate } from "../middleware/validate.js";
   import { MyBody } from "../schemas/area.js";
   router.post("/myEndpoint", express.json(), validate(MyBody), async (req, res) => {
     const result = await makeApiCallWithErrorHandling(res, ORDER_PATH, payload, "Failed");
     if (!result) return; // upstream error already sent
     res.json({ success: true, data: result.data });
   });
   ```
4. Register the router in `server/app.js` if it's a new file.
5. Throwing inside the handler is fine — Express 5 propagates async errors to
   `middleware/errorHandler.js` automatically.

### A new page

1. Add `public/<page>.html` with a single `<script type="module" src="js/pages/<page>.js">`.
2. Create `public/js/pages/<page>.js`:
   ```js
   import "../ui/errorModal.js";
   import "../ui/apiDebugConsole.js";
   import "../ui/navigation.js";
   import { apiCall } from "../shared/api.js";
   import { checkAndRefreshAuth } from "../shared/auth.js";

   if (!(await checkAndRefreshAuth())) /* will redirect */;
   // ...page logic
   ```

### A new checkout step

Each step lives in `server/services/checkout/<step>.js` and accepts the
shared `ctx` (per-request state + the auto-logging `ctx.call`):

```js
export async function myNewStep(ctx, { paymentId }) {
  return ctx.call(
    ORDER_PATH,
    { /* payload */ },
    "Checkout failed (myNewStep)"
  );
}
```

Then plug it into `server/services/checkout/orchestrator.js` in the right
position. Each `ctx.call` automatically pushes its API metadata into
`ctx.apiCalls`, which is returned to the UI's debug console.

## Tests

```bash
npm test
```

Coverage is intentionally narrow — the high-leverage paths only:

- `tests/services/apiErrors.test.js` — `classifyException` matrix.
- `tests/schemas/payments.test.js` — zod validation for the payment routes.
- `tests/services/checkout/orchestrator.test.js` — step order, skip-addPayment, short-circuit.
- `tests/routes/transaction.test.js` — `/transaction` via supertest (zod 400, happy 200, upstream 502).

## Known constraints

- The Adyen + 3DS flow is exercised against **event 01**, configured with
  Adyen CC as a payment method and "pick up later" as the delivery method.
- Real Adyen 3DS responses require a live av-avon environment; the test
  suite mocks the upstream so it can run anywhere.
- `/proxy` is an authenticated relay used by the API debug console — it's a
  test-only escape hatch and shouldn't be enabled outside of dev.
- The default cardholder name is hard-coded (`server/constants.js`) because
  the value comes from the hosted-fields widget at runtime but av-avon
  still requires the field to be set when calling `getPaymentClientToken`.

## Repo layout at a glance

```
.
├── server/                Express app, services, schemas, middleware
├── public/                Static assets + ES module frontend
├── tests/                 vitest suite
├── certs/                 (gitignored) localhost TLS certs
├── .env                   (gitignored)
├── eslint.config.js
├── .prettierrc.json
├── nodemon.json
└── package.json
```
