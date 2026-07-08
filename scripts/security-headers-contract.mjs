/**
 * Contract checks for centralized REST security headers + enforced CSP.
 */
import assert from "node:assert/strict";
import {
  CONTENT_SECURITY_POLICY,
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
    headers["permissions-policy"]?.includes("geolocation=(self)"),
    "Permissions-Policy must restrict geolocation to self"
  );
  assert.ok(
    headers["permissions-policy"]?.includes("microphone=()"),
    "Permissions-Policy must disable microphone"
  );
  assert.ok(
    headers["permissions-policy"]?.includes("camera=(self)"),
    "Permissions-Policy must restrict camera to self"
  );
  assert.equal(
    headers["content-security-policy"],
    CONTENT_SECURITY_POLICY,
    "blocking Content-Security-Policy must be enforced"
  );
  assert.equal(
    headers["content-security-policy-report-only"],
    undefined,
    "report-only CSP must not be set anymore (CSP is enforced)"
  );
}

const REQUIRED_CSP_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "script-src 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
  "report-uri /api/csp-report",
];
for (const directive of REQUIRED_CSP_DIRECTIVES) {
  assert.ok(
    CONTENT_SECURITY_POLICY.includes(directive),
    `CSP must include "${directive}"`
  );
}
assert.ok(
  !/script-src[^;]*'unsafe-inline'/.test(CONTENT_SECURITY_POLICY),
  "CSP script-src must not allow 'unsafe-inline'"
);
assert.ok(
  !/'unsafe-eval'/.test(CONTENT_SECURITY_POLICY),
  "CSP must not allow 'unsafe-eval'"
);

const dev = mockResponse();
applySecurityHeaders(dev, { isProduction: false });
assertBaseline(dev.headers);
assert.equal(dev.headers["strict-transport-security"], undefined);

const prod = mockResponse();
applySecurityHeaders(prod, { isProduction: true });
assertBaseline(prod.headers);
assert.ok(prod.headers["strict-transport-security"]?.includes("max-age="));

console.log("security-headers-contract: OK");
