/**
 * Contract checks for runtime URL/storage resolution (no browser, no Vite).
 */
import { resolveRuntimeParamValue } from "../src/lib/runtime-param-resolution.js";

function assert(cond, msg) {
  if (!cond) {
    throw new Error(msg || "assertion failed");
  }
}

const store = {};

let r = resolveRuntimeParamValue("api_url", "?api_url=", ["k1"], store, undefined);
assert(r === "", "empty URL param must resolve to empty string");
assert(store.k1 === "", "empty URL param must persist as empty string");

Object.keys(store).forEach((k) => delete store[k]);
r = resolveRuntimeParamValue("x", "", ["a"], store, "");
assert(r === "", 'defaultValue "" must persist');
assert(store.a === "");

Object.keys(store).forEach((k) => delete store[k]);
r = resolveRuntimeParamValue("x", "", ["b"], store, 0);
assert(r === 0, "defaultValue 0 must return 0");
assert(store.b === "0", 'defaultValue 0 must store as "0"');

Object.keys(store).forEach((k) => delete store[k]);
r = resolveRuntimeParamValue("x", "", ["c"], store, false);
assert(r === false, "defaultValue false must return false");
assert(store.c === "false", 'defaultValue false must store as "false"');

Object.keys(store).forEach((k) => delete store[k]);
r = resolveRuntimeParamValue("missing", "", ["d"], store, undefined);
assert(r === null, "undefined default with empty store must yield null");

Object.keys(store).forEach((k) => delete store[k]);
store.prefill = "saved";
r = resolveRuntimeParamValue("missing", "", ["prefill"], store, undefined);
assert(r === "saved", "must read persisted string including empty via prior write");

console.log("runtime-config-contract: OK");
