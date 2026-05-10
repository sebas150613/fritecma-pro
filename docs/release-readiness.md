# Release readiness & security status

Short checklist for FRIGEST before tagging or deploying to production. Complements automated CI and server-side env validation.

## 1. Current validated state

The following are implemented and enforced in automation where noted:

- REST-only runtime; legacy Base44 artifacts archived (not active dependencies).
- Runtime config contracts; REST smoke tests; Node tests for rate limiting, trust proxy parsing, auth-storage helpers, security headers.
- Rate limiting on `/api/auth`, `/api/ai`, and stricter limits on login POSTs; standardized `RateLimit-*` headers.
- `APP_TRUST_PROXY` configurable; no manual `x-forwarded-for` parsing for client IP in the limiter.
- Security headers + **Content-Security-Policy-Report-Only** (not blocking).
- Browser token storage helpers + logout clearing token keys and session activity marker (`src/lib/auth-storage.js`).
- **OrganizationSettings** sensitive fields are **encrypted at rest** (`enc:v1:…`, `server/lib/secret-crypto.js` + helpers in `server/lib/tenant.js`) using **`APP_SETTINGS_SECRET`** (≥ 32 chars in production per `check:production-env`). Responses to the client still use **`sanitizeOrganizationSettingsForClient`** (no secret values; **`*_configured`** flags only). **`req.currentOrganizationSettings`** holds **decrypted** values in memory for SMTP pedidos and internal use.
- `npm run release:check` (full gate before merge via Actions), including **multi-tenant isolation (IDOR)** and **RBAC** contracts against tenant APIs and sensitive routes.
- Production env checklist script (`npm run check:production-env`) for server/staging.
- Tracked-file secrets scan (`npm run check:secrets`); `npm audit` clean at last validation.
- **Legal / RGPD (baseline):** páginas estáticas en **`public/legal/`** con **datos identificativos del titular** (Sebastia Estela Adrover, NIF, domicilio en Palma, correos privacidad@frigest.es y soporte@frigest.es, sitio https://frigest.es). Los textos siguen siendo **documento de trabajo pendiente de revisión legal/DPO**.
- **Google Play Data Safety:** borrador técnico en **`docs/google-play-data-safety-draft.md`** con URLs definitivas de referencia (no declaración final en Play hasta validación).

## 2. Mandatory commands before release

| Where | Command |
|-------|---------|
| CI / local before merge | **`npm run release:check`** |
| Target server or staging (real env) | **`npm run check:production-env`** |

Run `check:production-env` only where deployment secrets and URLs are loaded; it is not part of default CI because CI does not mirror production secrets.

## 3. What `release:check` runs

In order:

1. Runtime config contract  
2. Legacy SDK reference audit  
3. Secrets scan (`check:secrets`)  
4. Security-hardening contract  
5. Auth-storage contract  
6. Organization settings client security (`check:org-settings-security`)  
7. Organization settings encryption (`check:org-settings-encryption`)  
8. Multitenant isolation contract (`check:multitenant-isolation`)  
9. RBAC contract (`check:rbac`)  
10. Security-headers contract  
11. Node tests  
12. ESLint  
13. Typecheck  
14. Production build  
15. REST smoke test  
16. `npm audit`

## 4. Critical production variables

Align with `server/config.js` and README:

| Variable | Expectation |
|----------|-------------|
| **`NODE_ENV`** | **`production`** on real hosts |
| **`APP_ALLOWED_ORIGINS`** | Comma-separated frontend origins; **no** `*`; prefer **`https://`** for non-local hosts |
| **`APP_ALLOW_AUTH_BYPASS`** | Explicitly **`false`** (required in production) |
| **`APP_DEV_TOKEN`** | **Empty** in production |
| **`APP_TRUST_PROXY`** | **`false`/omit** when Node listens directly; **`1`** or **`true`** only behind a **trusted** reverse proxy that sets forwarded headers correctly |
| **`APP_SERVER_HOST`** | Must stay loopback if auth bypass were ever enabled (bypass off in prod) |
| **`APP_SETTINGS_SECRET`** | **≥ 32 characters** in production — encrypts OrganizationSettings secrets at rest and platform owner SMTP (`platform-settings-service`) |

Also set **`DATABASE_URL`**, Stripe, AI, SMTP, etc., according to what you actually enable—see README and `npm run check:production-env` warnings.

## 5. GitHub Actions

| Workflow | Role |
|----------|------|
| **Release Check** | `npm ci` + **`npm run release:check`** on push/PR to `main` |
| **CI** | Fast check for merge-conflict markers (`<<<<<<<`, etc.) on `main` + `hardening/**` |

## 6. Branch protection note

A branch protection rule for `main` should require PRs and passing checks where possible. **Private repositories** on GitHub may show that protection **does not fully enforce** until **GitHub Team / Enterprise** (or equivalent)—review GitHub’s warning in repository settings.

## 7. Known residual risks

| Risk | Detail |
|------|--------|
| Session token in **`localStorage`** | Readable to same-origin script; XSS remains relevant until auth moves to HttpOnly cookies or similar. |
| **CSP Report-Only** | Violations are reported, not blocked; review reports before switching to enforcing CSP. |
| **In-memory rate limiting** | Per-process; not shared across multiple Node instances—fine for single instance; scale-out needs a shared store. |
| **Branch protection** | May not be strictly enforced on private repos without paid features—process discipline still required. |
| **Legacy plaintext rows** | Older JSON rows may still hold plaintext until touched or migrated via **`npm run migrate:org-settings-secrets -- --write`**; rotate credentials if they were ever leaked. |
| **New custom API routes** | Any new endpoint that returns or mutates **tenant-scoped** data should declare expected roles and add **IDOR** (`check:multitenant-isolation`) and/or **RBAC** (`check:rbac`) coverage when sensitive. |
| **Legal / RGPD / Google Play** | **Revisión legal/DPO** de los textos en `public/legal/*.html`; **verificar** que https://frigest.es y las rutas `/legal/*.html` responden públicamente con HTTPS; **publicación** real del sitio antes de enlazar desde Play; completar **Data Safety** en Play Console según `docs/google-play-data-safety-draft.md` y la lista real de SDK/servicios en producción. |

## 8. Recommended next improvements

- **Auth:** HttpOnly + SameSite cookies if auth is redesigned for production hardening.  
- **CSP:** Move to enforcing policy after collecting real violation reports from Report-Only.  
- **Rate limits:** Redis (or similar) if running multiple API replicas.  
- **GitHub:** Team/Enterprise or a public repo if policy enforcement in GitHub is a hard requirement.  
- **Operations:** Always verify live server env (including secrets presence and URLs) before go-live; scripts assist but do not replace human review.  
- **Organization secrets:** Rotate any credentials that lived in plaintext before encryption or that may have been exposed in older API responses or backups.
