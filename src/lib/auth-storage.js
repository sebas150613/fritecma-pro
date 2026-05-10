/**
 * Access-token storage keys and Storage helpers (browser or test doubles).
 * See README for session persistence notes.
 */

export const AUTH_ACCESS_TOKEN_KEYS = ["app_access_token", "token"];

/** Inactivity timestamp for session guard; cleared with auth on logout. */
export const SESSION_LAST_ACTIVITY_STORAGE_KEY = "fritecma_last_activity";

/**
 * @param {Pick<Storage, "getItem">} store
 * @returns {string|null}
 */
export function getStoredAuthTokenFrom(store) {
  for (const key of AUTH_ACCESS_TOKEN_KEYS) {
    const value = store.getItem(key);
    if (value !== null) {
      return value;
    }
  }
  return null;
}

function clearAuthAccessTokenKeys(store) {
  AUTH_ACCESS_TOKEN_KEYS.forEach((key) => store.removeItem(key));
}

/**
 * Writes the same token to all legacy keys for compatibility.
 * @param {Pick<Storage, "setItem">} store
 * @param {string|null|undefined} token
 */
export function setStoredAuthTokenIn(store, token) {
  if (!token) {
    clearAuthAccessTokenKeys(store);
    return;
  }
  const serialized = String(token);
  AUTH_ACCESS_TOKEN_KEYS.forEach((key) => store.setItem(key, serialized));
}

/**
 * Clears access tokens and session activity marker (logout).
 * @param {Pick<Storage, "removeItem">} store
 */
export function clearAuthSessionIn(store) {
  clearAuthAccessTokenKeys(store);
  store.removeItem(SESSION_LAST_ACTIVITY_STORAGE_KEY);
}
