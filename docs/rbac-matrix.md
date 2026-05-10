# RBAC matrix (FRIGEST REST API)

Derived from `server/lib/roles.js`, route handlers, and `app-schema/functions.json`. **Superadmin** here means `resolveAppRole` returning `superadmin` (hidden owner / global role). **Organization roles** are normalized via `normalizeOrganizationRole` (`admin`, `oficina`, `tecnico`, `ayudante`; legacy `encargado` → `admin`, `user` → `tecnico`).

## Helpers (code)

| Helper | Meaning |
|--------|---------|
| `resolveAppRole(user, membership)` | Global superadmin if hidden owner / `global_role`; else membership or user role normalized to org role. |
| `canOperateOffice(role)` | **superadmin**, **admin**, **oficina**. |
| `canManageOrganization(role)` | **superadmin**, **admin** only (`roles.js`; argument is a role string). |
| `requireBillingAdmin` (`billing.js`) | **admin**, **superadmin** only. |
| `requireOwner` (`billing.js`) | Hidden owner (`is_hidden_owner === true`) only. |
| `assertCanManageUsers` (`entities.js`) | Same as `canOperateOffice` — **admin**, **superadmin**, **oficina** for User / OrganizationMembership writes. |
| `assertCanWriteOrganizationSettings` (`entities.js`) | Same as `canOperateOffice` — writes to **OrganizationSettings** entity and org-wide settings via `PATCH /api/auth/me`. |

## Capability matrix

Legend: **yes** = allowed by current code · **no** = denied (403/401) · **n/a** = not applicable.

| Capability | superadmin / owner | admin | oficina | tecnico | ayudante |
|------------|-------------------|-------|---------|---------|----------|
| **Login / session / GET `/api/auth/me`** | yes | yes | yes | yes | yes |
| **Anonymous `/api/auth/me`** | no (401) | no | no | no | no |
| **Read tenant operational entities** (e.g. Client, list scoped) | Owner token blocked from tenant ops (`403` “Owner account cannot access tenant operational data”) | yes | yes | yes | yes |
| **PATCH `/api/auth/me` — user profile fields only** | yes | yes | yes | yes | yes |
| **PATCH `/api/auth/me` — organization settings fields** (`ORGANIZATION_SETTINGS_FIELDS`) | yes | yes | yes | **no** | **no** |
| **`POST` / `PATCH` / `DELETE` `/api/entities/OrganizationSettings`** | yes (if not hidden-owner tenant block) | yes | yes | **no** | **no** |
| **`POST /api/users/invite`** (`users.js`) | yes (hidden owner rules apply for superadmin invites) | yes | **no** | **no** | **no** |
| **`POST/PATCH/DELETE` User / OrganizationMembership** (`entities.js` `assertCanManageUsers`) | hidden owner: tenant user entities blocked by `assertEntityAccessAllowed` where applicable | yes | yes | **no** | **no** |
| **`GET /api/entities/User`** (list in org) | owner: tenant blocked | yes | yes | yes | yes |
| **`GET /api/organizations`** (memberships filter) | yes | yes | yes | yes | yes |
| **`GET /api/organizations/current`** | yes | yes | yes | yes | yes |
| **`GET /api/organizations/plans`** | yes | yes | yes | yes | yes |
| **`GET /api/billing/summary`** | yes | yes | yes | yes | yes |
| **`POST /api/billing/checkout`**, **`POST /api/billing/portal`**, **`POST /api/billing/contact-sales`** | owner can target org via query/body | yes | **no** | **no** | **no** |
| **`POST /api/billing/assign-plan`** | yes (owner only) | **no** | **no** | **no** | **no** |
| **`GET /api/organizations/owner-overview`**, hard-delete org, **`POST /api/organizations`**, **`POST .../:id/users`** (panel) | hidden owner only | **no** | **no** | **no** | **no** |
| **Callable functions** (`/api/functions/:name`) | Per `app-schema/functions.json`; handler checks `currentUser.role` ∈ definition.roles | Same | **oficina**: VeriFactu sandbox/process/retry where listed | **no** on admin-only functions | **no** on admin-only functions |
| **`POST /api/ai/invoke`** | **revisar/manual**: only `requireAuth` — any authenticated org user may invoke (rate-limited). | yes | yes | yes | yes |
| **`DELETE /api/account/me`** | **no** (403 owner message) | **no** (403) | **no** (403) | yes (204) | yes (204) |

## Public vs authenticated

| Route area | Notes |
|------------|--------|
| **`GET /health`** | Public (no auth). |
| **`/api/apps/public/*`** | Public app configuration (see `public-app.js`). |
| **`/api/auth/*`** | Mixed: login/register views and callbacks public; **`GET/PATCH /api/auth/me`** require auth. |
| **`POST /api/billing/webhook`** | Stripe webhook (raw body), not session auth. |

## Residual / manual review

- **AI**: No role gate on `server/routes/ai.js`; only auth + rate limit. Treat as “any authenticated user” unless product adds `canOperateOffice` or similar.
- **New routes**: Declare expected roles and extend `scripts/rbac-contract.mjs` when adding sensitive capabilities.
