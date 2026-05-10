/**
 * Contract checks for centralized REST security headers + CSP Report-Only.
 */
import assert from "node:assert/strict";
import {
  CONTENT_SECURITY_POLICY_REPORT_ONLY,
  applySecurityHeaders,
} from "../server/lib/security-headers.js";

function mockResponse() {
  const headers = {};
  return {
    headers,
    setHeader(name, value) {
      headers[name.toLowerCase()] = String(value);
    },
  };
}

function assertBaseline(headers) {
  assert.equal(headers["x-content-type-options"], "nosniff");
  assert.equal(headers["x-frame-options"], "DENY");
  assert.equal(headers["referrer-policy"], "no-referrer");
  assert.ok(
    headers["permissions-policy"]?.includes("geolocation=()"),
    "Permissions-Policy must disable geolocation"
  );
  assert.ok(
    headers["permissions-policy"]?.includes("microphone=()"),
    "Permissions-Policy must disable microphone"
  );
  assert.ok(
    headers["permissions-policy"]?.includes("camera=()"),
    "Permissions-Policy must disable camera"
  );
  assert.ok(
    headers["content-security-policy-report-only"],
    "Content-Security-Policy-Report-Only must be present"
  );
  assert.equal(
    headers["content-security-policy"],
    undefined,
    "blocking Content-Security-Policy must not be set yet"
  );
  assert.ok(
    CONTENT_SECURITY_POLICY_REPORT_ONLY.includes("default-src 'self'"),
    "CSP RO must include default-src"
  );
}

const dev = mockResponse();
applySecurityHeaders(dev, { isProduction: false });
assertBaseline(dev.headers);
assert.equal(dev.headers["strict-transport-security"], undefined);

const prod = mockResponse();
applySecurityHeaders(prod, { isProduction: true });
assertBaseline(prod.headers);
assert.ok(prod.headers["strict-transport-security"]?.includes("max-age="));

console.log("security-headers-contract: OK");
