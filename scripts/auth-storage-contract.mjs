/**
 * Contract checks for auth token Storage helpers (no browser, no Vite).
 */
import assert from "node:assert/strict";
import {
  AUTH_ACCESS_TOKEN_KEYS,
  SESSION_LAST_ACTIVITY_STORAGE_KEY,
  clearAuthSessionIn,
  getStoredAuthTokenFrom,
  setStoredAuthTokenIn,
} from "../src/lib/auth-storage.js";

function createMemoryStorage() {
  const map = new Map();
  return {
    getItem(key) {
      const v = map.get(key);
      return v === undefined ? null : String(v);
    },
    setItem(key, value) {
      map.set(key, String(value));
    },
    removeItem(key) {
      map.delete(key);
    },
  };
}

const store = createMemoryStorage();

assert.strictEqual(getStoredAuthTokenFrom(store), null);
setStoredAuthTokenIn(store, "tok-a");
assert.strictEqual(getStoredAuthTokenFrom(store), "tok-a");
assert.strictEqual(store.getItem(AUTH_ACCESS_TOKEN_KEYS[0]), "tok-a");

store.setItem(SESSION_LAST_ACTIVITY_STORAGE_KEY, "1700000000000");
clearAuthSessionIn(store);
assert.strictEqual(getStoredAuthTokenFrom(store), null);
assert.strictEqual(store.getItem(SESSION_LAST_ACTIVITY_STORAGE_KEY), null);

setStoredAuthTokenIn(store, "tok-b");
assert.strictEqual(store.getItem("token"), "tok-b");
assert.strictEqual(getStoredAuthTokenFrom(store), "tok-b");

setStoredAuthTokenIn(store, "");
assert.strictEqual(getStoredAuthTokenFrom(store), null);

// Mirrors OAuth redirect cleanup: remove access_token from query without leaking secret in history
const params = new URLSearchParams("?access_token=secret&keep=1");
params.delete("access_token");
assert.ok(!params.toString().includes("secret"));
assert.ok(params.toString().includes("keep"));

console.log("auth-storage-contract: OK");
