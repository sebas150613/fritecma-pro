#!/usr/bin/env node
/**
 * Contract: OrganizationSettings encryption at rest + client sanitization.
 */
import assert from "node:assert/strict";
import {
  decryptOrganizationSettingsFromStorage,
  encryptOrganizationSettingsForStorage,
  isSensitiveOrganizationSettingsKey,
  mergeDecryptedOrgSecretsForServer,
  sanitizeOrganizationSettingsForClient,
} from "../server/lib/tenant.js";
import {
  decryptSecret,
  encryptSecret,
  isEncryptedSecret,
  maybeDecryptSecret,
} from "../server/lib/secret-crypto.js";

const TEST_SECRET =
  "contract-org-settings-encryption-secret-key-min-32chars!!";
const opts = { secret: TEST_SECRET };

const plain = "hello-plain-secret";
const enc = encryptSecret(plain, opts);
assert.ok(isEncryptedSecret(enc));
assert.equal(decryptSecret(enc, opts), plain);
assert.equal(maybeDecryptSecret(enc, opts), plain);
assert.equal(encryptSecret(enc, opts), enc);

const legacy = "legacy-plaintext-password";
assert.equal(decryptSecret(legacy, opts), legacy);
assert.equal(maybeDecryptSecret(legacy, opts), legacy);

const settingsPlain = {
  verifactu_nif: "B12345678",
  verifactu_cert_password: plain,
  pedidos_smtp_host: "smtp.example.com",
  pedidos_smtp_pass: "smtp-secret",
  pedidos_smtp_user: "notify@example.com",
  api_key: "k-secret",
  custom_token: "tok-secret",
};

const stored = encryptOrganizationSettingsForStorage(settingsPlain, opts);
assert.ok(isEncryptedSecret(String(stored.verifactu_cert_password)));
assert.ok(isEncryptedSecret(String(stored.pedidos_smtp_pass)));
assert.ok(isEncryptedSecret(String(stored.api_key)));
assert.equal(stored.verifactu_nif, "B12345678");
assert.equal(stored.pedidos_smtp_host, "smtp.example.com");
assert.equal(stored.pedidos_smtp_user, "notify@example.com");

const roundtrip = decryptOrganizationSettingsFromStorage(stored, opts);
assert.equal(roundtrip.verifactu_cert_password, plain);
assert.equal(roundtrip.pedidos_smtp_pass, "smtp-secret");

const safe = sanitizeOrganizationSettingsForClient(roundtrip);
assert.ok(!Object.prototype.hasOwnProperty.call(safe, "verifactu_cert_password"));
assert.ok(!Object.prototype.hasOwnProperty.call(safe, "pedidos_smtp_pass"));
assert.equal(safe.verifactu_cert_password_configured, true);
assert.equal(safe.pedidos_smtp_pass_configured, true);

const emptySafe = sanitizeOrganizationSettingsForClient({
  verifactu_cert_password: "",
  pedidos_smtp_pass: null,
});
assert.equal(emptySafe.verifactu_cert_password_configured, false);
assert.equal(emptySafe.pedidos_smtp_pass_configured, false);

const merged = mergeDecryptedOrgSecretsForServer(
  { id: "u1", role: "admin", email: "a@b.c" },
  roundtrip
);
assert.equal(merged.verifactu_cert_password, plain);

assert.ok(isSensitiveOrganizationSettingsKey("verifactu_cert_password"));
assert.ok(!isSensitiveOrganizationSettingsKey("verifactu_nif"));

console.log("org-settings-encryption-contract: OK");
