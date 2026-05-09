# REST API Contract

This document defines the HTTP contract expected by the `rest` app provider.

## Base URL

- `VITE_APP_API_URL`
- Example: `http://localhost:3000`

## Authentication

Requests may include:

- `Authorization: Bearer <token>`
- `X-App-Id: <app-id>`

## Auth Endpoints

### `GET /api/auth/login?redirect_uri=<url>`

Development login page that lets you select a local user and starts a session.

### `POST /api/auth/login`

Creates a local session and redirects back to the frontend with:

- `access_token`
- `from_url`

### `GET /api/auth/me`

Returns the current user.

Response example:

```json
{
  "id": "usr_123",
  "email": "admin@example.com",
  "full_name": "Admin",
  "role": "admin",
  "is_active": true
}
```

### `PATCH /api/auth/me`

Updates the current user profile.

Request body:

```json
{
  "full_name": "Updated Name"
}
```

### `POST /api/auth/logout`

Invalidates the current session if applicable.

Response example:

```json
{
  "success": true
}
```

### `GET /api/auth/logout-page?redirect_uri=<url>`

Redirect helper page used after logout.

## User Management

### `POST /api/users/invite`

Creates an invitation or provisional user record.

Request body:

```json
{
  "email": "tech@example.com",
  "role": "user"
}
```

## Entity Endpoints

All entities use the same generic contract.

Supported entities currently referenced by the UI:

- `Absence`
- `AuditLog`
- `CalendarEvent`
- `Client`
- `GasBottle`
- `GasTransfer`
- `Intervention`
- `Invoice`
- `InvoiceRetryQueue`
- `Material`
- `MaterialFamily`
- `MaterialRequest`
- `MaterialSubfamily`
- `Project`
- `ProjectMaterial`
- `StockEntry`
- `StockMovement`
- `Supplier`
- `TimeRecord`
- `User`
- `Visit`
- `WorkCenter`
- `WorkDay`

### `GET /api/entities/:entity`

List records.

Query params:

- `sort`
- `limit`

Example:

`GET /api/entities/Client?sort=name&limit=200`

### `POST /api/entities/:entity/query`

Filters records.

Request body:

```json
{
  "filter": {
    "is_active": true
  },
  "sort": "name",
  "limit": 500
}
```

### `POST /api/entities/:entity`

Creates a record.

Request body:

```json
{
  "name": "Example"
}
```

### `PATCH /api/entities/:entity/:id`

Updates a record by id.

### `DELETE /api/entities/:entity/:id`

Deletes a record by id.

## File Endpoints

### `POST /api/files/public`

Multipart upload for public files.

Expected form fields:

- `file`

Response example:

```json
{
  "file_url": "http://localhost:3000/uploads/public/example.png",
  "file_uri": "public/example.png"
}
```

### `POST /api/files/private`

Multipart upload for private files.

Response example:

```json
{
  "file_url": "http://localhost:3000/uploads/private/example.p12",
  "file_uri": "private/example.p12"
}
```

### `POST /api/files/signed-url`

Creates a direct or temporary URL for a stored file.

Request body:

```json
{
  "file_uri": "private/example.p12"
}
```

## AI Endpoint

### `POST /api/ai/invoke`

Invokes the configured AI provider.

Request body:

```json
{
  "prompt": "Summarize this",
  "file_urls": [],
  "model": "optional-model",
  "response_json_schema": {
    "type": "object"
  }
}
```

Response behavior:

- plain chat/text requests return a string
- structured extraction requests return a JSON object matching `response_json_schema`
- local `/uploads/...` image URLs are accepted and converted server-side when needed

## Email (owner panel)

### `GET /api/email/settings`

Hidden owner only. Returns SMTP/from/reply-to metadata (no secrets).

### `PATCH /api/email/settings`

Hidden owner only. Updates platform email configuration (`smtp_*`, `email_from`, `email_from_name`, `email_reply_to`, `email_enabled`, etc.).

### `POST /api/email/test`

Hidden owner only. Sends a fixed test message to the given `to` (or current user email).

Notes:

- There is **no** public `POST /api/email/send`. Outbound mail from the app uses server-composed templates and owner-configured `from` / `reply_to`.

## Business notifications (authenticated, tenant-scoped)

### `POST /api/business/interventions/:interventionId/send-client-email`

**Roles:** admin, superadmin, oficina (office-capable).

Body: empty JSON `{}`. Server loads the intervention and client in the current organization, composes subject/body, and sends using platform email settings.

### `POST /api/business/material-requests/:requestId/notify-approvers`

**Authorization:** the material request’s `technician_email` must match the current user, or the user must be office-capable.

Body: empty JSON `{}`. Server notifies internal approvers (admin/oficina memberships) with a fixed template.

## Function Endpoints

### `POST /api/functions/:name`

Invokes a named backend function.

Functions currently referenced by the project:

- `processVerifactu`
- `processVerifactuRetry`
- `retryVerifactuSubmissions`
- `sendClockInNotifications`
- `syncGasBottleStatus`
- `testVerifactuSandbox`
- `verifyInvoiceHashes`

Current REST scaffold coverage:

- `processVerifactu`: implemented with local invoice generation and sandbox-style status
- `processVerifactuRetry`: implemented with simulated acceptance result
- `retryVerifactuSubmissions`: implemented for local retry queue processing
- `sendClockInNotifications`: implemented using the REST email service
- `syncGasBottleStatus`: implemented
- `testVerifactuSandbox`: implemented
- `verifyInvoiceHashes`: implemented for local invoice integrity checks

## Notes

- The REST provider currently treats subscriptions as unsupported and returns a no-op unsubscribe function.
- Entity payloads are intentionally flexible because the existing UI writes many different shapes.
- The backend scaffold in `server/` implements this contract as a local development starting point.
