import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isSafeRedirectUri,
  resolveSafeRedirectUri,
} from "../server/lib/redirect-safety.js";

const PROD = {
  allowedOrigins: ["https://frigest.tramuntanalabs.es"],
  isProduction: true,
};
const DEV = { allowedOrigins: [], isProduction: false };

test("isSafeRedirectUri", async (t) => {
  await t.test("accepts an allowlisted production origin (any path)", () => {
    assert.equal(isSafeRedirectUri("https://frigest.tramuntanalabs.es/", PROD), true);
    assert.equal(
      isSafeRedirectUri("https://frigest.tramuntanalabs.es/dashboard?x=1", PROD),
      true
    );
  });

  await t.test("rejects an external origin in production (open redirect)", () => {
    assert.equal(isSafeRedirectUri("https://evil.example.com/", PROD), false);
    assert.equal(isSafeRedirectUri("https://evil.example.com", PROD), false);
  });

  await t.test("rejects loopback in production", () => {
    assert.equal(isSafeRedirectUri("http://127.0.0.1:5173/", PROD), false);
  });

  await t.test("rejects non-http(s) schemes and malformed URLs", () => {
    assert.equal(isSafeRedirectUri("javascript:alert(1)", PROD), false);
    assert.equal(isSafeRedirectUri("data:text/html,x", PROD), false);
    assert.equal(isSafeRedirectUri("/relative/path", PROD), false);
    assert.equal(isSafeRedirectUri("not a url", PROD), false);
    assert.equal(isSafeRedirectUri("", PROD), false);
    assert.equal(isSafeRedirectUri(undefined, PROD), false);
  });

  await t.test("allows loopback only outside production", () => {
    assert.equal(isSafeRedirectUri("http://127.0.0.1:5173/", DEV), true);
    assert.equal(isSafeRedirectUri("http://localhost:5173/", DEV), true);
    assert.equal(isSafeRedirectUri("https://evil.example.com/", DEV), false);
  });
});

test("resolveSafeRedirectUri", async (t) => {
  await t.test("returns the candidate when safe", () => {
    assert.equal(
      resolveSafeRedirectUri("https://frigest.tramuntanalabs.es/x", {
        ...PROD,
        fallback: "https://fallback/",
      }),
      "https://frigest.tramuntanalabs.es/x"
    );
  });

  await t.test("falls back to the first allowed origin in production", () => {
    assert.equal(
      resolveSafeRedirectUri("https://evil.example.com/steal", {
        ...PROD,
        fallback: "http://127.0.0.1:5173/",
      }),
      "https://frigest.tramuntanalabs.es/"
    );
  });

  await t.test("falls back to provided fallback outside production", () => {
    assert.equal(
      resolveSafeRedirectUri("https://evil.example.com/", {
        ...DEV,
        fallback: "http://127.0.0.1:5173/",
      }),
      "http://127.0.0.1:5173/"
    );
  });
});
