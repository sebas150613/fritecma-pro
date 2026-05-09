# SaaS Phase 5

This phase moves platform email delivery out of code and into the FRIGEST owner panel.

## Delivered

- Platform SMTP settings can now be managed from the owner panel in the application
- SMTP configuration is persisted in backend storage and overrides environment defaults
- Owner can send a test email from the panel
- Email services automatically pick up updated SMTP settings without code changes

## Platform Endpoints

- `GET /api/email/settings`
- `PATCH /api/email/settings`
- `POST /api/email/test`

These endpoints are restricted to the hidden owner account.

## Security Note

- If `APP_SETTINGS_SECRET` is configured, the SMTP password is encrypted before persistence
- If `APP_SETTINGS_SECRET` is empty, SMTP credentials still work but are stored without encryption

## Operational Model

- Environment variables remain as bootstrap fallback values
- Once SMTP is configured from the panel, FRIGEST uses the platform-stored values
- Verification emails, invitation emails, password reset emails, and any other backend emails use the same platform SMTP configuration
