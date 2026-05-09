# SaaS Phase 4

This phase hardens FRIGEST account operations and closes the gap between a functional SaaS and a commercially credible one.

## Delivered

- Company role model aligned to:
  - global role: `superadmin`
  - organization roles: `admin`, `oficina`, `tecnico`, `ayudante`
- Legacy role aliases are normalized automatically during SaaS bootstrap
- Invitation flow now sends a real activation email or login email
- Email verification flow with hosted verification endpoint
- Password reset request and reset completion flows
- Sensitive auth tokens are removed from user payloads

## Hosted Account Flows

Available routes:

- `/api/auth/login`
- `/api/auth/signup`
- `/api/auth/accept-invite`
- `/api/auth/forgot-password`
- `/api/auth/reset-password`
- `/api/auth/verify-email`

## Invitation Behavior

- New invited users receive an activation link
- Existing users added to a company receive a login link
- Invitation delivery uses the same SMTP/stub pipeline as the rest of the platform

## Security Notes

- Password reset responses are generic and do not reveal whether an email exists
- Verification and reset links are one-time tokens with expiration
- User payloads no longer expose invitation or auth token material

## Environment

```env
APP_REQUIRE_EMAIL_VERIFICATION=false
```

When enabled later in production policy, this flag can be used as the enforcement gate after operational rollout and QA.
