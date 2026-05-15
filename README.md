# test_app

A demo Node/Express app that exercises the AudienceView (av-avon) API
end-to-end through the browser: login → events listing → seat selection →
checkout → Adyen Drop-in (with 3DS challenge) → order confirmation.

Used as a sandbox to reproduce payment-flow scenarios that are hard to
repro inside the full AudienceView UI.

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

| Script | What it does |
| --- | --- |
| `npm start`      | Run the server once. |
| `npm run dev`    | Run with `nodemon` (auto-restart on server edits). |
| `npm test`       | Run the vitest suite. |
| `npm run lint`   | ESLint over `server/` and `public/js/`. |
| `npm run format` | Prettier write-mode. |

## Where to go next

- **[CLAUDE.md](./CLAUDE.md)** — full project context: architecture,
  coding standards, how to add a route / page / checkout step, debugging
  tips, glossary, file pointers. Read this first.
- **[DOC.md](./DOC.md)** — request lifecycle: how one HTTP call moves
  from the browser through Express, the `av` builder, and back. Read
  this when you need to understand a specific layer.
