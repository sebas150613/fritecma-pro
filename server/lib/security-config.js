/**
 * Centralized security-related parsing and host checks (no Express coupling).
 */

export function isLoopbackHost(host) {
  if (host == null || typeof host !== "string") {
    return false;
  }
  const h = host.trim().toLowerCase();
  if (h === "") {
    return false;
  }
  if (h === "127.0.0.1" || h === "localhost" || h === "::1") {
    return true;
  }
  if (h === "[::1]") {
    return true;
  }
  return false;
}

export function assertAuthBypassHostSafety({ allowAuthBypass, host }) {
  if (allowAuthBypass === true && !isLoopbackHost(host)) {
    throw new Error(
      "Unsafe configuration: APP_ALLOW_AUTH_BYPASS=true is only allowed when APP_SERVER_HOST is loopback."
    );
  }
}

/**
 * Parse Express "trust proxy" setting from APP_TRUST_PROXY.
 * @param {string | undefined} raw
 * @returns {false | true | number}
 */
export function parseTrustProxy(raw) {
  if (raw === undefined || raw === null) {
    return false;
  }
  const s = String(raw).trim();
  if (s === "") {
    return false;
  }
  if (s === "false") {
    return false;
  }
  if (s === "true") {
    return true;
  }
  if (/^\d+$/.test(s)) {
    const n = parseInt(s, 10);
    if (n <= 0) {
      throw new Error(
        `Invalid APP_TRUST_PROXY: must be a positive integer when numeric (received ${JSON.stringify(raw)}). Use "false" or omit for local.`
      );
    }
    return n;
  }
  throw new Error(
    `Invalid APP_TRUST_PROXY: expected "true", "false", empty, or a positive integer; received ${JSON.stringify(raw)}`
  );
}
