# SaaS Foundation

## Implemented in this phase

- Multi-organization foundation with `Organization`, `OrganizationMembership` and `OrganizationSettings`.
- Authentication now resolves a current organization for each session.
- Business entities are automatically scoped by `organization_id`.
- Existing local data is backfilled into a default organization during bootstrap.
- Company fiscal and VeriFactu settings are now stored at organization level.
- User invitations now create memberships inside the current organization.
- Public and private uploads are separated by organization, and private file access now requires authentication.

## Current behavior

- Existing local demo users are attached to the default organization created at bootstrap.
- `GET /api/auth/me` returns the current organization and its settings together with the current user.
- `PATCH /api/auth/me` keeps backward compatibility for the frontend while persisting organization settings in `OrganizationSettings`.
- User lists returned by the REST entity API are scoped to the current organization.

## Next phase

- Add organization onboarding and organization creation flows.
- Add billing entities and Stripe checkout/webhooks.
- Add subscription enforcement for seats and plan limits.
- Add organization switcher UI for multi-organization users.
- Move from JSON stores to PostgreSQL with proper relational constraints.
- Add audit logs for tenant administration and billing actions.
