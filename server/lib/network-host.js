/**
 * Pure helpers for validating bind/listen hosts (no env loading).
 */

export function isLoopbackHost(host) {
  if (host == null || typeof host !== "string") {
    return false;
  }
  const h = host.trim().toLowerCase();
  if (h === "127.0.0.1" || h === "localhost" || h === "::1") {
    return true;
  }
  if (h === "[::1]") {
    return true;
  }
  return false;
}
