/**
 * Centralized HTTP security headers for the REST server.
 * CSP is enforced; violations are reported to /api/csp-report.
 */

/** @type {string} */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "style-src 'self' 'unsafe-inline' https:",
  "script-src 'self'",
  "connect-src 'self' https: wss:",
  "form-action 'self'",
  "upgrade-insecure-requests",
  "report-uri /api/csp-report",
].join("; ");

/**
 * @param {import("express").Response} res
 * @param {{ isProduction: boolean }} opts
 */
export function applySecurityHeaders(res, { isProduction }) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "geolocation=(self), microphone=(), camera=(self)"
  );
  res.setHeader(
    "Content-Security-Policy",
    CONTENT_SECURITY_POLICY
  );
  if (isProduction) {
    res.setHeader(
      "Strict-Transport-Security",
      "max-age=15552000; includeSubDomains"
    );
  }
}

/**
 * @param {{ isProduction: boolean }} opts
 * @returns {import("express").RequestHandler}
 */
export function createSecurityHeadersMiddleware({ isProduction }) {
  return (_req, res, next) => {
    applySecurityHeaders(res, { isProduction });
    next();
  };
}
