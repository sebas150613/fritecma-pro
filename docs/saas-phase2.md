# SaaS Phase 2

## Implemented

- Organization creation and switching APIs.
- Subscription plan catalog with seeded plans: `starter`, `growth`, `enterprise`.
- Organization subscription records with status, provider, Stripe linkage and billing periods.
- Seat-limit enforcement during user invitation and membership reactivation.
- Billing summary endpoint for the current organization.
- Stripe checkout session creation for plan upgrades.
- Stripe billing portal session creation for self-service customer management.
- Stripe webhook handler for checkout completion and subscription lifecycle sync.
- Frontend organization switcher and SaaS billing panel.

## Main routes

- `GET /api/organizations`
- `GET /api/organizations/current`
- `GET /api/organizations/plans`
- `POST /api/organizations`
- `POST /api/organizations/switch`
- `GET /api/billing/summary`
- `POST /api/billing/checkout`
- `POST /api/billing/portal`
- `POST /api/billing/webhook`

## Environment

Add these variables to `.env.local` when enabling Stripe:

```env
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
VITE_STRIPE_PUBLISHABLE_KEY=
STRIPE_PRICE_STARTER=
STRIPE_PRICE_GROWTH=
STRIPE_PRICE_ENTERPRISE=
```

## Current limitation

- Billing persistence still uses local JSON stores.
- Webhook processing is production-shaped, but the platform has not yet been migrated to PostgreSQL.
- Public signup is still not implemented; onboarding currently starts from an authenticated session.

## Recommended next phase

- Public signup and company onboarding flow.
- PostgreSQL migration for organizations, memberships and subscriptions.
- Invoice/billing event history and dunning workflows.
- Seat add-ons and overage handling.
- Role-specific organization administration UX polish.
