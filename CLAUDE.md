# CLAUDE.md — Project context for `test_app`

This file is everything an AI assistant (or any new contributor) should
know before touching the codebase. If you only read one doc, read this
one. If you need the request lifecycle in detail, read [DOC.md](./DOC.md).

---

## What this app is

`test_app` is a small Node/Express demo that exercises the AudienceView
(av-avon) API end-to-end through the browser:

```
login  →  events listing  →  event detail + seat selection
       →  checkout (hosted fields OR Adyen Drop-in)
       →  3DS challenge (Cardinal Commerce)  →  order confirmation
```

It exists as a sandbox to reproduce payment-flow scenarios that are hard
to repro inside the full AudienceView UI — especially the Adyen + 3DS
edge cases.

**What it is not:**
- Not a production app. Single-user, in-memory session, test-only `/proxy` relay.
- Not a TypeScript project. Plain ES modules; JSDoc for types.
- Not bundled. The browser loads ES modules natively, one `<script type="module">` per page.
- Not a place to add features beyond payment-flow demos. Keep it minimal.

---

## Running it

```bash
./generate_certs.ps1   # one-time: localhost TLS certs
npm install
# Configure .env at the project root:
#   API_BASE=https://<your-avon>
#   UNL_USER=<user>
#   UNL_PASSWORD=<pass>
#   PORT=3000
#   HTTPS_PORT=3443
npm run dev            # nodemon — auto-restart on server edits
```

Open **https://localhost:3443**.

| Script | What it does |
| --- | --- |
| `npm start` | Run the server once. |
| `npm run dev` | nodemon — restart on `server/**` edits. |
| `npm test` | vitest suite (27 tests). |
| `npm run lint` | ESLint over `server/` and `public/js/`. |
| `npm run format` | Prettier write-mode. |

---

## Architecture in one diagram

```
public/                              server/
├── <page>.html                      ├── index.js          bootstrap (listen)
│   <script type="module"            ├── app.js            createApp() factory
│     src="js/pages/<page>.js">      │
├── js/                              ├── config/
│   ├── pages/                       │   ├── env.js        loads + validates .env
│   ├── flows/                       │   ├── security.js   helmet CSP
│   ├── ui/                          │   └── https.js      async cert loading
│   ├── shared/                      │
│   ├── adyen/                       ├── middleware/
│   └── endpoints.js (shared)        │   ├── handler.js    handler({ body, run }) factory
                                     │   ├── validate.js   zod-based body/query validation
                                     │   └── errorHandler.js   central ApiError → JSON
                                     │
                                     ├── routes/           one file per area
                                     │   ├── login.js, events.js, payments.js,
                                     │   ├── threeDS.js, adyen.js, seats.js,
                                     │   ├── details.js, customer.js, proxy.js
                                     │
                                     ├── schemas/          zod schemas per route
                                     │
                                     ├── services/
                                     │   ├── av.js                  fluent av builder
                                     │   ├── avResponse.js          unwrap, parseResponse
                                     │   ├── apiErrors.js           classifyException
                                     │   ├── cookieSync.js          mirrors Set-Cookie back
                                     │   ├── requestContext.js      AsyncLocalStorage trail
                                     │   ├── order.js               insertOrder, redirectToViewOrder
                                     │   ├── threeDSChallenge.js    handleThreeDS
                                     │   ├── checkout/              per-step + orchestrator
                                     │   ├── auth/                  authenticate, loadX
                                     │   └── adyen/                 parseClientConfig, parseGatewayConfig
                                     │
                                     ├── av/               av-avon vocabulary (CONSTANTS)
                                     │   ├── objectNames.js   MY_ORDER, MY_CUSTOMER, ...
                                     │   ├── methods.js       INSERT, ADD_CUSTOMER, ...
                                     │   └── fields.js        ORDER_NUMBER, paymentField(), ...
                                     │
                                     ├── constants.js      EXCEPTION_CODES, ACCEPTED_WARNINGS, ...
                                     └── utils/            sessionStore, debug, cookieUtils, authHeaders
```

For the request lifecycle (browser → server → av-avon → browser), see
[DOC.md](./DOC.md).

---

## The standards we've codified

These are non-negotiable in this codebase. New code MUST follow them; if
something doesn't fit a standard, push back on the design before adding
an exception.

### 1. Naming

- **camelCase everywhere** on our own API surface: request bodies,
  response bodies, query params, JS variables.
- **snake_case only at the av-avon wire boundary**, and only via
  constants in `server/av/fields.js` (`PAYMENT_FIELDS.ACTIVE_PAYMENT`,
  `paymentField(id, key)`).
- **`Id` suffix** for identifiers: `paymentId`, `admissionId`, `eventId`,
  `priceTypeId`, `paymentMethodId`. Never `paymentID`.
- **`Method` suffix** for user-chosen options where ambiguous:
  `deliveryMethod`, `paymentMethod`. The Adyen gateway's payment-method
  *identifier* is `paymentMethodId` (an Id); the chosen value is
  `paymentMethod`.
- **Affirmative booleans**: `resetPaymentAttempt`, never `disableX`.
- **Acronyms stay uppercase**: `paResponseURL`, `paRequestURL`,
  `apiBase`. (Convention: if av-avon writes it uppercase, we do too.)

### 2. The av-avon vocabulary rule

If a string belongs to a category defined in `server/av/*.js`, it must
be a constant — never a literal. Categories:

1. **Top-level entity names** (`Order`, `Admissions`, `Seats`, ...) → `av/fields.js`.
2. **Scoped `X::Y` field paths** (`Order::order_number`) → `av/fields.js`.
3. **`myFoo` object names** (`myOrder`, `myCustomer`) → `av/objectNames.js`.
4. **av-avon action method names** (`getBestAvailable`) → `av/methods.js`.

The all-or-nothing rule: extracting some members of a category but not
others is forbidden. Half-extracted is worse than none. There's a
verification grep in DOC.md's bottom section.

### 3. Endpoint shape

Every route file follows the **define-and-mount** pattern. See
[DOC.md § 3](./DOC.md#3-the-route--handler-body-run).

```js
const myEndpoint = handler({
  body: MyBody,                          // optional zod schema
  async run({ field1, field2 }, { req, res }) {
    const { data } = await av
      .on(MY_ORDER)
      .get(SOME_FIELD)
      .post(ORDER_PATH)
      .orFail("Something went wrong");

    return { success: true, ...domainFields };
  },
});

router.post("/myEndpoint", myEndpoint);
```

Rules:
- `run` receives `input = { ...req.params, ...validated body, ...validated query }` and `ctx = { req, res }`.
- `return` a plain object → the factory sends JSON + auto-appends `backendApiCalls`.
- `throw new ApiError(status, message, { code?, details? })` for explicit errors.
- Return `undefined` only when something downstream wrote the response
  (e.g. `handleThreeDS`, `redirectToViewOrder`).
- No `res.status().json()` in happy paths — that's the factory's job.

The mount table lives at the **bottom of each route file**. A reader
should be able to glance at the bottom of `routes/<area>.js` and see
every URL the area owns.

### 4. Response envelope

```js
// Success
{ success: true, ...domainFields, rawResponse?, backendApiCalls? }

// Error  — thrown via ApiError, formatted by errorHandler middleware
{ success: false, error, message, code?, status, details?, backendApiCalls? }
```

- `success: true | false` is always present.
- Domain fields are flat at the top level. No `data:` / `response:` wrapper.
- One documented exception: `/map/availability/:id` spreads the av-avon body
  (`return { success: true, ...data }`) so the UI can read `data.data.Admissions`.
- `rawResponse?: object` is the full av-avon body when the UI needs it
  for re-extraction (e.g. `event.js`'s `refreshSeats()`).
- `backendApiCalls?: [...]` is auto-attached by the handler factory.
  **Never write it manually.**

### 5. Error flow

- Services throw `ApiError(status, message, { details?, code? })` on
  failure. They do not write to `res` directly.
- The central `errorHandler` middleware (mounted last in `server/app.js`)
  catches every throw and writes the standard error envelope.
- Express 5 propagates async-handler errors natively; no `try/catch`
  wrappers are needed inside `run`. The handler factory adds one
  defensive try/catch anyway, so even sync throws inside a `run` work.
- Stop using the old `if (!result) return;` null-check pattern. It's
  gone. Awaited av calls either succeed or throw.

### 6. Per-request state — the AsyncLocalStorage trail

Every HTTP request opens an AsyncLocalStorage frame (via
`runWithRequestContext()` middleware). Inside that frame:

- `av._execute()` records every av-avon call's metadata into the trail.
- The auth services (`server/services/auth/*`) also call `recordApiCall()`
  for their manual fetches.
- The handler factory appends the trail to the success response as
  `backendApiCalls`.
- The error handler appends the trail to error responses too.

The UI's debug console (Ctrl+\` in the browser) reads `backendApiCalls`
and shows every upstream call the request made.

### 7. Frontend state

- **Cross-page checkout state** lives in `public/js/shared/checkoutContext.js`
  (backed by `sessionStorage`, cleared on tab close). Never use
  `localStorage` for it.
- **`eventId` is also in the URL** (`checkout.html?eventId=01`) so the URL
  is shareable.
- **No `window.X = ...` globals** for cross-module communication.
  Exceptions: the three self-registering UI helpers
  (`apiDebugConsole`, `showApiError`, `HostedFieldsManager`) by design,
  and only because their interface is a singleton.
- **No inline `onclick=` in HTML.** Use `addEventListener` after `innerHTML`.

---

## How to add things

### A new route

1. If it takes a body or query, write/extend a zod schema in
   `server/schemas/<area>.js`.
2. In `server/routes/<area>.js`, declare a named `handler({ body, run })`
   const.
3. Inside `run`, use the `av` fluent builder to call av-avon. Use
   constants from `server/av/*.js`. Return a plain object on success;
   `throw new ApiError(...)` on failure.
4. Mount it at the bottom of the file:
   `router.post("/myEndpoint", myEndpoint)`.
5. Register the router in `server/app.js` if you created a new route file.

### A new av-avon call inside an existing handler

Use the builder:

```js
const { data } = await av
  .on(MY_ORDER)                  // objectName
  .action(METHOD, params, { acceptWarnings })  // optional
  .get(FIELD_A, FIELD_B)         // payload.get
  .set({ [FIELD_C]: value })     // payload.set
  .post(ORDER_PATH)
  .orFail("Friendly error message");
```

If you need to look at a non-2xx response without throwing (e.g. to
classify a 4294), drop `.orFail()`:

```js
const { response, data } = await av.on(MY_ORDER).get(FIELD).post(ORDER_PATH);
if (!response.ok) { /* inspect data, decide */ }
```

If a 4294 isn't an error in this flow (e.g. `getPaymentClientToken`),
add `.surfaceThreeDS()` and check `result.requires3ds`.

### A new av-avon field, method, or object name

Add it to the right file:
- A top-level entity (`Foo`) or scoped field (`Foo::bar`) → `server/av/fields.js`.
- A `myFoo` object name → `server/av/objectNames.js`.
- An action method → `server/av/methods.js`.

If the field has many per-row variants (`Payments::<id>::xxx`), add the
key to `PAYMENT_FIELDS` in `av/fields.js` and use `paymentField(id, key)`
at the call site.

### A new page

1. Create `public/<page>.html` with one entry:
   ```html
   <script type="module" src="js/pages/<page>.js"></script>
   ```
2. Create `public/js/pages/<page>.js`. Start with the standard imports:
   ```js
   import "../ui/errorModal.js";
   import "../ui/apiDebugConsole.js";
   import "../ui/navigation.js";
   import { apiCall } from "../shared/api.js";
   import { checkAndRefreshAuth } from "../shared/auth.js";

   if (!(await checkAndRefreshAuth())) /* will redirect */;
   // page logic
   ```

### A new checkout step

The orchestrator (`server/services/checkout/orchestrator.js`) composes
named step functions. Each lives in its own file under
`server/services/checkout/` and accepts `(ctx, params)`:

```js
// services/checkout/myStep.js
export async function myStep(ctx, { paymentId }) {
  return ctx.call(
    ORDER_PATH,
    { /* payload */ },
    "Checkout failed (myStep)"
  );
}
```

Plug it into `orchestrator.js` in the right position. `ctx.call`'s
metadata is auto-captured into the AsyncLocalStorage trail.

---

## How to debug

### Server-side

- **`npm run dev`** keeps the server hot-reloading on every edit.
- **`printDebugMessage(...)`** (from `server/utils/debug.js`) writes to
  stdout when `DEBUG_MODE` is enabled. Use it for domain-level traces.
- **morgan** logs every HTTP request automatically.
- The most common server-side mistake is a missing field constant. The
  symptom is usually a `unwrap(data, FIELD)` returning undefined. Grep
  the constant name in `server/av/` to confirm it matches av-avon's
  actual field path.

### Browser-side

- **Ctrl + \`** opens the API debug console (a VS-Code-style bottom
  panel). It shows every backend av-avon call that the latest request
  made, with the request body, response body, status, and duration.
- **The error modal** auto-pops on any non-2xx response. It has a
  collapsible JSON viewer for both the request and the response.
- **`window.checkoutContext` doesn't exist** — use
  `import { getContext } from "/js/shared/checkoutContext.js"` in the
  DevTools console (must be a module-scope page).

### Tests

- **`npm test`** runs the vitest suite. It's intentionally narrow:
  classifyException matrix, schemas, the orchestrator step flow, the
  `/transaction` route via supertest, and the handler factory.
- Tests mock `_execute` from `server/services/av.js` to avoid hitting
  av-avon. The orchestrator test scripts mocked responses for each step
  in order.

---

## Repo conventions

### Git workflow

- Long-running refactor work lives on the `refactor` branch.
- Each sub-step is its own branch off `refactor`: `step/<NN>-<slug>`.
- Sub-step branches are merged back with `--no-ff` so the topology
  preserves the work (Azure DevOps PR style):
  ```bash
  git checkout refactor
  git merge --no-ff step/NN-slug -m "Merge step/NN-slug: <one-line>"
  git branch -d step/NN-slug
  ```
- Commit messages: conventional-ish prefix (`refactor:`, `feat:`,
  `test:`, `docs:`, `chore:`) + concise description. No Claude
  co-author tag.

### Branch naming

`step/NN-slug` not `refactor/NN-slug` — git can't have both a `refactor`
leaf-ref and a `refactor/xxx` sub-ref.

### Linting

ESLint flat config (`eslint.config.js`) with:
- `no-var`, `prefer-const`, `eqeqeq`, `no-shadow`, `no-unused-vars` (warn).
- Browser globals on `public/js/**`, node globals on `server/**`,
  vitest globals on `tests/**`.

Prettier (`.prettierrc.json`): `printWidth: 100`, double-quotes,
trailing commas (es5).

### Tests

- vitest + supertest.
- Tests live under `tests/` mirroring the source tree.
- Don't test the frontend in jsdom — payment widgets are too painful.
  The frontend gets manual smoke tests only.

---

## Known constraints

- The Adyen + 3DS flow is exercised against **event 01**, configured
  with Adyen CC as a payment method and "pick up later" as the delivery.
  Other events may not have Adyen configured.
- Real Adyen 3DS responses require a live av-avon environment. The
  test suite mocks the upstream so tests run anywhere.
- **`/proxy`** is an authenticated relay used by the API debug console.
  It's a test-only escape hatch and must not ship outside dev.
- The default cardholder name is hard-coded
  (`server/constants.js:DEFAULT_CARDHOLDER_NAME`) because the real
  value comes from the hosted-fields widget at runtime, but av-avon
  still requires the field to be set when calling `getPaymentClientToken`.
- **`node_modules/` is gitignored.** Run `npm install` after pulling.
- HTTPS certs are generated by `generate_certs.ps1` and gitignored.
  Without them the server falls back to HTTP on port 3000.

---

## Glossary

- **av-avon**: AudienceView's backend HTTP API. Snake_case fields,
  session-cookie auth, double-nested `data: { data: {...} }` envelope.
- **Hosted fields**: AudienceView's own card-input widget (the legacy
  payment flow). Tokenization via `AvHostedInputSDK.submitGroup()`.
- **Adyen Drop-in**: Adyen's payment widget (the modern payment flow).
  Loaded from the CDN in `checkout.html`.
- **3DS / PaRes**: 3D-Secure challenge. Cardinal Commerce serves the
  challenge in an iframe; the response (`PaRes`) is forwarded back to
  av-avon via `/processThreeDSResponse`.
- **`MyOrder`, `myCustomer`, etc.**: av-avon "session objects" — long-lived
  records keyed by the session that subsequent calls reference by name.
- **Soft error**: av-avon returns 200 with `errorCode` or
  `message: "...error..."` in the body. Treated as a failure by the
  route (returned as 400/401 to the UI).
- **Trail / `backendApiCalls`**: the array of every av-avon call a
  single HTTP request made, auto-attached to every response.

---

## Pointers — "where do I find...?"

| Looking for... | File |
| --- | --- |
| The bootstrap | `server/index.js` |
| Express app factory (used by tests too) | `server/app.js` |
| Every route's URL | bottom of each `server/routes/<area>.js` |
| Body validation rules | `server/schemas/<area>.js` |
| The av-avon HTTP client | `server/services/av.js` |
| Field/method/object catalogs | `server/av/*.js` |
| ApiError + how errors are formatted | `server/middleware/errorHandler.js` |
| The handler factory | `server/middleware/handler.js` |
| AsyncLocalStorage trail | `server/services/requestContext.js` |
| Session + cookies (in-memory) | `server/utils/sessionStore.js` |
| /login flow steps | `server/services/auth/{authenticate,loadSessionCustomerId,loadMyCustomer}.js` |
| /checkout flow steps | `server/services/checkout/*.js` |
| Adyen config parsing | `server/services/adyen/parse*.js` |
| Cross-page state on the frontend | `public/js/shared/checkoutContext.js` |
| 3DS Cardinal iframe handler | `public/js/flows/threeDS.js` |
| Hosted-fields submit flow | `public/js/flows/paymentFlow.js` |
| The API debug console | `public/js/ui/apiDebugConsole.js` (583 lines, IIFE) |
| Manual cert gen | `generate_certs.ps1` |

---

## What's intentionally NOT in scope

- TypeScript migration. JSDoc-typed JS is enough for the size of this
  app.
- A bundler. Native ES modules via `<script type="module">` work fine.
- Rewriting the big self-contained UI helpers (`apiDebugConsole.js`,
  `errorModal.js`, `hostedFields.js`). They register on `window` and
  initialize themselves; that's the right pattern for an isolated UI
  widget.
- Frontend test coverage. Jsdom + payment widgets is more pain than
  value at this scale.
- Production hardening: rate limiting, real auth, multi-user session
  store. This is a single-user demo.

---

## How to explain this app to a new contributor

A 5-minute walkthrough that lands the mental model:

1. **"It's a payment-flow sandbox."** One user logs in, picks a seat,
   checks out, gets charged. The point is to reproduce edge cases
   (3DS challenges, Adyen quirks) in isolation.
2. **"The browser talks to Express, Express talks to av-avon."** The
   browser never hits av-avon directly. Every request is mediated by an
   Express route that adds the session + cookies. See the diagram in
   [DOC.md](./DOC.md).
3. **"Every route looks the same."** Show them one route file (e.g.
   `routes/details.js` — it's 52 lines). Point at the route table at
   the bottom; jump to the named const. Each handler is the same shape:
   parse → payload → av call → shape response.
4. **"The `av` builder reads like English."** Walk through one
   `await av.on(...).get(...).post(...).orFail(...)` chain.
5. **"Throwing is how routes report failure."** No `res.status().json()`
   in happy paths — `throw new ApiError(...)` and the central middleware
   handles it.
6. **"Every string at the av-avon boundary is a constant."** Open
   `server/av/fields.js` — every `Order::order_number`-style path is
   here, by name.

Then point them at this file and [DOC.md](./DOC.md). They'll have
enough to start.
