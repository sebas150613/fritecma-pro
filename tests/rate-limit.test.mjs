import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { createRateLimiter, getClientIp } from "../server/lib/rate-limit.js";

function collectHeaders() {
  const headers = {};
  return {
    headers,
    res: {
      setHeader(k, v) {
        headers[k.toLowerCase()] = String(v);
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json() {
        return this;
      },
    },
  };
}

describe("getClientIp", () => {
  test("prefers req.ip over socket and ignores x-forwarded-for when req.ip is set", () => {
    const ip = getClientIp({
      ip: "10.0.0.5",
      socket: { remoteAddress: "192.168.1.1" },
      headers: { "x-forwarded-for": "203.0.113.99" },
    });
    assert.equal(ip, "10.0.0.5");
  });

  test("falls back to req.socket.remoteAddress", () => {
    const ip = getClientIp({
      socket: { remoteAddress: "172.16.0.3" },
    });
    assert.equal(ip, "172.16.0.3");
  });

  test("does not read x-forwarded-for when req.ip is absent", () => {
    const ip = getClientIp({
      headers: { "x-forwarded-for": "198.51.100.1" },
      socket: {},
    });
    assert.equal(ip, "unknown");
  });
});

describe("createRateLimiter", () => {
  test("allows up to max then returns 429 with required headers", () => {
    const max = 2;
    const limiter = createRateLimiter({
      namespace: "t-max",
      windowMs: 60_000,
      max,
    });

    const r1 = collectHeaders();
    let n1 = false;
    limiter({ ip: "203.0.113.1", socket: {} }, r1.res, () => {
      n1 = true;
    });
    assert.equal(n1, true);
    assert.equal(r1.headers["ratelimit-limit"], String(max));
    assert.ok(Number(r1.headers["ratelimit-remaining"]) >= 0);
    assert.ok(r1.headers["ratelimit-reset"]);

    const r2 = collectHeaders();
    limiter({ ip: "203.0.113.1", socket: {} }, r2.res, () => {});
    assert.ok(r2.headers["ratelimit-limit"]);

    const r3 = collectHeaders();
    let n3 = false;
    limiter({ ip: "203.0.113.1", socket: {} }, r3.res, () => {
      n3 = true;
    });
    assert.equal(n3, false);
    assert.equal(r3.res.statusCode, 429);
    assert.match(r3.headers["retry-after"], /^\d+$/);
    assert.equal(r3.headers["ratelimit-limit"], String(max));
    assert.equal(r3.headers["ratelimit-remaining"], "0");
    assert.ok(r3.headers["ratelimit-reset"]);
  });

  test("keyGenerator separates buckets for same IP different keys", () => {
    const limiter = createRateLimiter({
      namespace: "t-kg",
      windowMs: 60_000,
      max: 1,
      keyGenerator(req) {
        return `${req.ip}:${req.body?.slot || "a"}`;
      },
    });

    const rA = collectHeaders();
    limiter({ ip: "1.1.1.1", body: { slot: "a" }, socket: {} }, rA.res, () => {});
    const rA2 = collectHeaders();
    let okA2 = false;
    limiter({ ip: "1.1.1.1", body: { slot: "a" }, socket: {} }, rA2.res, () => {
      okA2 = true;
    });
    assert.equal(okA2, false);
    assert.equal(rA2.res.statusCode, 429);

    const rB = collectHeaders();
    let okB = false;
    limiter({ ip: "1.1.1.1", body: { slot: "b" }, socket: {} }, rB.res, () => {
      okB = true;
    });
    assert.equal(okB, true);
  });
});
