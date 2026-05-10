**FRIGEST**

**About**

This project contains everything you need to run your app locally.

**Edit the code in your local development environment**

This repository is being migrated away from direct Base44-specific project wiring while preserving the current app behavior.

**Prerequisites:** 

1. Clone the repository using the project's Git URL 
2. Navigate to the project directory
3. Install dependencies: `npm install`
4. Create an `.env.local` file and set the right environment variables

```
VITE_APP_ID=your_app_id
VITE_APP_BACKEND_PROVIDER=rest
VITE_APP_API_URL=http://localhost:3000
VITE_APP_LOGIN_URL=http://localhost:3000/api/auth/login
VITE_APP_LOGOUT_URL=http://localhost:3000/api/auth/logout-page

APP_ALLOW_AUTH_BYPASS=false
APP_TRUST_PROXY=false
APP_PUBLIC_SIGNUP_ENABLED=true
APP_REQUIRE_EMAIL_VERIFICATION=false
APP_DATABASE_SSL=false
DATABASE_URL=
APP_SETTINGS_SECRET=

APP_AI_PROVIDER=openai
OPENAI_API_KEY=
APP_AI_MODEL=gpt-5-mini
APP_AI_VISION_MODEL=gpt-5-mini
APP_AI_TIMEOUT_MS=90000

APP_SMTP_HOST=
APP_SMTP_PORT=587
APP_SMTP_SECURE=false
APP_SMTP_USER=
APP_SMTP_PASS=
APP_EMAIL_FROM=
APP_EMAIL_REPLY_TO=

STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
VITE_STRIPE_PUBLISHABLE_KEY=
STRIPE_PRICE_STARTER=
STRIPE_PRICE_GROWTH=
STRIPE_PRICE_ENTERPRISE=

e.g.
VITE_APP_ID=local-app
VITE_APP_BACKEND_PROVIDER=rest
VITE_APP_API_URL=http://127.0.0.1:3000
```

Run the app: `npm run dev`

Run the REST backend scaffold: `npm run server:dev`

Run frontend + backend together in REST mode: `npm run dev:rest`

Seed demo data for REST mode: `npm run seed:rest -- --reset`

Run the REST smoke test: `npm run smoke:rest`

Before a production release or deployment, run **`npm run release:check`**. It runs in order: runtime config contract, Base44 audit, **tracked-file secrets scan** (`check:secrets`), security-hardening, auth-storage, **organization settings client security** (`check:org-settings-security`), **organization settings encryption** (`check:org-settings-encryption`), security-headers contracts, Node tests, lint, typecheck, build, REST smoke test, and **`npm audit`** (fails if any vulnerability is reported). Run **`npm run check:secrets`** alone for the same scan; it masks matches and does not replace GitHub secret scanning or manual review.

Security / release summary: [docs/release-readiness.md](./docs/release-readiness.md)

**Production environment checklist**

On the **server or staging** (with real env vars injected), run **`npm run check:production-env`**. It applies production rules (`--production`), validates **`NODE_ENV`**, **`APP_ALLOW_AUTH_BYPASS=false`** (explicit), empty **`APP_DEV_TOKEN`**, non-wildcard **`APP_ALLOWED_ORIGINS`** (prefer **`https://`** for non-local origins), **`APP_TRUST_PROXY`** parsing, **`APP_SERVER_HOST`** vs bypass (same rules as `server/config.js`), **`APP_SETTINGS_SECRET`** (required, **≥ 32 characters**, never printed), Stripe/AI/DATABASE presence where relevant, and never prints secret values. For a dry local run without production env, use **`node scripts/production-env-check.mjs`** (relaxed). This check is **not** part of **`release:check`** / CI because CI does not load production secrets.

Expected highlights for real production: **`NODE_ENV=production`**, **`APP_ALLOWED_ORIGINS`** = comma-separated **`https://…`** frontend origins (no `*`), **`APP_ALLOW_AUTH_BYPASS=false`**, **`APP_DEV_TOKEN`** empty, **`APP_TRUST_PROXY=false`** off the Node port or **`1`/`true`** behind a trusted reverse proxy, **`APP_SETTINGS_SECRET`** at least **32 characters** (encrypts OrganizationSettings secrets at rest and platform SMTP password), **`DATABASE_URL`** set when using PostgreSQL, Stripe and OpenAI variables if those features are live. Port is **`APP_SERVER_PORT`** (default 3000 in `server/config.js`).

Audit remaining Base44 references: `npm run audit:base44`

Audit REST entity parity against the archived legacy entity set: `npm run audit:entities`

Audit REST function parity against the archived legacy function set: `npm run audit:functions`

REST contract reference: [docs/rest-api-contract.md](./docs/rest-api-contract.md)

SaaS phase 1 reference: [docs/saas-foundation.md](./docs/saas-foundation.md)

SaaS phase 2 reference: [docs/saas-phase2.md](./docs/saas-phase2.md)

SaaS phase 3 reference: [docs/saas-phase3.md](./docs/saas-phase3.md)

SaaS phase 4 reference: [docs/saas-phase4.md](./docs/saas-phase4.md)

SaaS phase 5 reference: [docs/saas-phase5.md](./docs/saas-phase5.md)

**Session / auth token (browser)**

The SPA stores the REST **access token** in **`localStorage`** under `app_access_token` (and legacy `token` for compatibility). Client-side session timing uses a separate key defined in `src/lib/auth-storage.js`; **logout** clears token keys and that activity marker. OAuth-style redirects may pass `access_token` once in the query string; the app persists it and **`history.replaceState`** strips it from the URL. **Residual risk:** any data in `localStorage` is readable to script on the page, so XSS remains a concern. A future hardening step is **HttpOnly + SameSite cookies** for the session if you redesign auth for production.

**Organization settings (API vs server)**

Sensitive OrganizationSettings fields are stored **encrypted at rest** (`enc:v1:…` AES-256-GCM via **`APP_SETTINGS_SECRET`**). After load, **`req.currentOrganizationSettings`** holds **decrypted** values for server-side SMTP pedidos and internal flows. JSON responses still use **`sanitizeOrganizationSettingsForClient`** (`server/lib/tenant.js`): secret-shaped fields are omitted and replaced with **`*_configured`** flags only. Legacy plaintext rows remain readable and are re-encrypted on next update; optional **`npm run migrate:org-settings-secrets`** (dry-run by default, **`--write`** to persist) rewrites existing JSON store rows.

**Content-Security-Policy (REST responses)**

The backend sends **`Content-Security-Policy-Report-Only`** (via `server/lib/security-headers.js`). It does **not** send a blocking **`Content-Security-Policy`** header yet. Next step when you are ready: collect violations from real usage, tighten directives if needed, then switch to an enforcing policy.

**Runtime note**

The primary app runtime is **REST-only** (local backend in `server/` + REST API client on the frontend). Legacy Base44 artifacts remain archived under `archive/base44/` as migration reference only; they are not part of the active build or runtime.

The application **does not declare** `@base44/sdk`, `@base44/vite-plugin`, or other Base44 npm packages in `package.json`. Use `npm run audit:base44` to catch accidental reintroductions in active source paths.

Entity schemas used by the local REST backend now live in `app-schema/entities/`, and the old Base44 entity definitions are archived in `archive/base44/entities/` as historical reference material.
The active REST function registry now lives in `app-schema/functions.json`, and the old Base44 function implementations are archived in `archive/base44/functions/` as historical reference material.

The repo already includes a local backend scaffold in `server/` with:

- generic entity CRUD persisted to local JSON files
- local development auth bootstrap
- public/private file upload endpoints
- SMTP email support with stub fallback and local delivery log
- OpenAI-backed AI endpoint with text and structured JSON responses
- local implementations for `processVerifactu`, retry queue, gas sync, clock-in notifications, hash verification and sandbox test

Suggested local REST setup:

1. Copy `.env.rest.example` to `.env.local` and adjust values if needed. Keep `APP_TRUST_PROXY=false` (or omit it) on your machine; use `APP_TRUST_PROXY=1` or `true` only when the API sits behind a **trusted** reverse proxy configured by infrastructure (so client IPs are correct). Never enable trust proxy without that setup.
2. Run `npm run seed:rest -- --reset`
3. Run `npm run dev:rest`
4. Open `http://127.0.0.1:3000/api/auth/login?redirect_uri=http://127.0.0.1:5173/`

The REST scaffold now supports local session-based login for development users.
The smoke test boots the local REST server, exercises auth, entities, files/functions and exits with a non-zero code if a critical flow breaks.
The seed script loads representative demo data so dashboard, stock, interventions, calendar, suppliers and projects have meaningful content in REST mode.

If `OPENAI_API_KEY` is not set, the REST backend keeps the app stable with safe AI fallbacks:

- chat returns a friendly configuration message
- OCR/structured extraction returns an empty object matching the requested schema

If SMTP is not configured, email sends are accepted in stub mode and recorded in `server/data/email-deliveries.json`.

`testVerifactuSandbox` also accepts `{ "dry_run": true }` so you can validate the REST flow without making an external AEAT call.
