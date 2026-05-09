# SaaS Phase 3

This phase moves FRIGEST from an internal multi-tenant scaffold to a SaaS-ready access layer.

## Delivered

- Public organization signup at `/api/auth/signup`
- Standard email/password login at `/api/auth/login`
- Professional hosted auth screens for login, signup, and owner private access
- Production-capable persistence adapter with PostgreSQL support through `DATABASE_URL`
- Automatic bootstrap of PostgreSQL storage schema on server start
- Lazy migration of legacy JSON-backed entity/file stores into PostgreSQL when records are first accessed

## Runtime Model

### Authentication

- `APP_ALLOW_AUTH_BYPASS=true` keeps the local development selector available
- `APP_PUBLIC_SIGNUP_ENABLED=true` enables self-serve company onboarding
- Standard users authenticate with email/password
- The private owner account remains isolated behind `/api/auth/private-login`

### Storage

- Without `DATABASE_URL`, the server keeps using local JSON files exactly as before
- With `DATABASE_URL`, entity data and file-backed stores move to PostgreSQL automatically
- Existing JSON data is imported into PostgreSQL the first time each store is used, as long as the target store is empty

## Environment

Example production-oriented variables:

```env
APP_ALLOW_AUTH_BYPASS=false
APP_PUBLIC_SIGNUP_ENABLED=true
DATABASE_URL=postgres://user:password@host:5432/frigest
APP_DATABASE_SSL=true
```

## Signup Flow

Public signup creates:

- the initial admin user
- the organization
- the active organization membership
- organization settings
- a starter subscription in `trialing` state
- a valid application session

## Next Recommended Phase

The next professional step is operational hardening:

- password reset flow
- email verification
- invitation emails
- webhook-driven billing lifecycle completion
- managed PostgreSQL migrations instead of lazy import bootstrap
