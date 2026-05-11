#!/usr/bin/env node
/**
 * Contract: OrganizationSettings API responses must never include raw secret values.
 */
import assert from "node:assert/strict";
import {
  sanitizeOrganizationSettingsForClient,
} from "../server/lib/tenant.js";

const assertNoSecretKeys = (sanitized, forbiddenKeys) => {
  for (const key of forbiddenKeys) {
    assert.ok(
      !Object.prototype.hasOwnProperty.call(sanitized, key),
      `sanitized output must not contain key "${key}"`
    );
  }
};

const input = {
  id: "settings-1",
  organization_id: "org-1",
  owner_profile_billing_email: "billing@example.com",
  verifactu_nif: "B12345678",
  verifactu_nombre: "Acme SL",
  verifactu_cert_uri: "private/org/x.p12",
  verifactu_cert_password: "secret-cert-value",
  verifactu_produccion: true,
  pedidos_smtp_host: "smtp.example.com",
  pedidos_smtp_port: 587,
  pedidos_smtp_secure: false,
  pedidos_smtp_user: "notify@example.com",
  pedidos_smtp_pass: "smtp-secret",
  pedidos_smtp_enabled: true,
  smtp_secret: "should-strip",
  api_key: "should-strip",
  custom_password: "strip-me",
  invitation_token: "should-strip",
};

const sanitized = sanitizeOrganizationSettingsForClient(input);

assert.ok(sanitized, "sanitized must be non-null");

assertNoSecretKeys(sanitized, [
  "verifactu_cert_password",
  "pedidos_smtp_pass",
  "smtp_secret",
  "api_key",
  "custom_password",
  "invitation_token",
]);

assert.equal(sanitized.verifactu_cert_password_configured, true);
assert.equal(sanitized.pedidos_smtp_pass_configured, true);
assert.equal(sanitized.smtp_secret_configured, true);
assert.equal(sanitized.api_key_configured, true);
assert.equal(sanitized.custom_password_configured, true);
assert.equal(sanitized.invitation_token_configured, true);

assert.equal(sanitized.verifactu_produccion, true);
assert.equal(sanitized.verifactu_nif, "B12345678");
assert.ok(
  !Object.prototype.hasOwnProperty.call(sanitized, "owner_profile_billing_email"),
  "owner_profile_* keys must not appear in tenant-facing sanitized settings"
);
assert.equal(sanitized.pedidos_smtp_host, "smtp.example.com");
assert.equal(sanitized.pedidos_smtp_user, "notify@example.com");
assert.equal(sanitized.organization_id, "org-1");

const emptySecrets = sanitizeOrganizationSettingsForClient({
  verifactu_cert_password: "",
  pedidos_smtp_pass: null,
  pedidos_smtp_host: "h.example.com",
});

assert.equal(emptySecrets.verifactu_cert_password_configured, false);
assert.equal(emptySecrets.pedidos_smtp_pass_configured, false);
assert.equal(emptySecrets.pedidos_smtp_host, "h.example.com");

console.log("organization-settings-security-contract: OK");
