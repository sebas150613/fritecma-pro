import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  assertAuthBypassHostSafety,
  isLoopbackHost,
  parseTrustProxy,
} from "../server/lib/security-config.js";

describe("isLoopbackHost", () => {
  test("accepts loopback hosts", () => {
    assert.equal(isLoopbackHost("127.0.0.1"), true);
    assert.equal(isLoopbackHost("localhost"), true);
    assert.equal(isLoopbackHost("::1"), true);
    assert.equal(isLoopbackHost("[::1]"), true);
  });

  test("rejects non-loopback", () => {
    assert.equal(isLoopbackHost("0.0.0.0"), false);
    assert.equal(isLoopbackHost("192.168.1.10"), false);
    assert.equal(isLoopbackHost("example.com"), false);
    assert.equal(isLoopbackHost(""), false);
    assert.equal(isLoopbackHost(null), false);
    assert.equal(isLoopbackHost(undefined), false);
  });
});

describe("assertAuthBypassHostSafety", () => {
  test("throws when allowAuthBypass true and host not loopback", () => {
    assert.throws(
      () =>
        assertAuthBypassHostSafety({
          allowAuthBypass: true,
          host: "0.0.0.0",
        }),
      /APP_ALLOW_AUTH_BYPASS=true/
    );
  });

  test("does not throw when allowAuthBypass true and host loopback", () => {
    assert.doesNotThrow(() =>
      assertAuthBypassHostSafety({
        allowAuthBypass: true,
        host: "127.0.0.1",
      })
    );
  });

  test("does not throw when allowAuthBypass false and host not loopback", () => {
    assert.doesNotThrow(() =>
      assertAuthBypassHostSafety({
        allowAuthBypass: false,
        host: "192.168.1.10",
      })
    );
  });
});

describe("parseTrustProxy", () => {
  test("parses valid values", () => {
    assert.equal(parseTrustProxy(undefined), false);
    assert.equal(parseTrustProxy(""), false);
    assert.equal(parseTrustProxy("false"), false);
    assert.equal(parseTrustProxy("true"), true);
    assert.equal(parseTrustProxy("1"), 1);
    assert.equal(parseTrustProxy("2"), 2);
  });

  test("rejects invalid values", () => {
    assert.throws(() => parseTrustProxy("0"), /Invalid APP_TRUST_PROXY/);
    assert.throws(() => parseTrustProxy("abc"), /Invalid APP_TRUST_PROXY/);
  });
});
