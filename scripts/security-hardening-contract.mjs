/**
 * Contract checks for rate limiting and loopback host detection (no extra deps).
 */
import assert from "node:assert/strict";
import { createRateLimiter } from "../server/lib/rate-limit.js";
import { isLoopbackHost, parseTrustProxy } from "../server/lib/security-config.js";

function runLimiterScenario({
  max,
  windowMs,
  namespace,
  ip,
  requests,
  expectBlockedAtIndex,
}) {
  const limiter = createRateLimiter({ windowMs, max, namespace });
  let blockedAt = -1;
  const results = [];

  for (let i = 0; i < requests; i += 1) {
    const req = { ip, socket: {} };
    const headers = {};
    const res = {
      statusCode: 200,
      headers,
      setHeader(k, v) {
        headers[k.toLowerCase()] = String(v);
      },
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(payload) {
        this.body = payload;
        return this;
      },
    };
    let calledNext = false;
    limiter(req, res, () => {
      calledNext = true;
    });
    results.push({
      calledNext,
      statusCode: res.statusCode,
      headers: { ...headers },
      body: res.body,
    });
    if (!calledNext && res.statusCode === 429) {
      blockedAt = i;
      break;
    }
  }

  if (expectBlockedAtIndex != null) {
    assert.equal(
      blockedAt,
      expectBlockedAtIndex,
      `expected 429 at request index ${expectBlockedAtIndex}, got ${blockedAt}`
    );
  }

  return results;
}

const loopbackCases = [
  ["127.0.0.1", true],
  ["localhost", true],
  ["::1", true],
  ["[::1]", true],
  ["0.0.0.0", false],
  ["192.168.1.10", false],
  ["example.com", false],
];

for (const [host, expected] of loopbackCases) {
  assert.equal(
    isLoopbackHost(host),
    expected,
    `isLoopbackHost(${JSON.stringify(host)}) expected ${expected}`
  );
}

const windowMs = 60_000;

// Allows exactly max requests, blocks on max+1
const maxSmall = 3;
const resultsSmall = runLimiterScenario({
  max: maxSmall,
  windowMs,
  namespace: "contract-small",
  ip: "203.0.113.5",
  requests: maxSmall + 2,
  expectBlockedAtIndex: maxSmall,
});
assert.equal(resultsSmall.length, maxSmall + 1);
assert.equal(resultsSmall[maxSmall - 1].calledNext, true);
assert.equal(resultsSmall[maxSmall].statusCode, 429);
assert.match(
  resultsSmall[maxSmall].headers["retry-after"],
  /^\d+$/,
  "Retry-After must be set on 429"
);
assert.ok(
  Number(resultsSmall[maxSmall].headers["ratelimit-limit"]) === maxSmall
);
assert.ok(
  Number(resultsSmall[maxSmall].headers["ratelimit-remaining"]) === 0
);
assert.ok(resultsSmall[maxSmall].headers["ratelimit-reset"]);

// Namespace isolation: separate counters for same IP
const nsA = createRateLimiter({
  namespace: "ns-a",
  windowMs,
  max: 1,
});
const nsB = createRateLimiter({
  namespace: "ns-b",
  windowMs,
  max: 1,
});

function oneShot(limiter, ip) {
  let nexted = false;
  const res = {
    setHeader() {},
    status() {
      return this;
    },
    json() {},
  };
  limiter({ ip, socket: {} }, res, () => {
    nexted = true;
  });
  return nexted;
}

assert.equal(oneShot(nsA, "198.51.100.2"), true);
assert.equal(
  oneShot(nsA, "198.51.100.2"),
  false,
  "second hit same ns/ip should rate-limit"
);
assert.equal(oneShot(nsB, "198.51.100.2"), true);

// Different IPs: limit 1 per IP
const perIp = createRateLimiter({
  namespace: "per-ip",
  windowMs,
  max: 1,
});
assert.equal(oneShot(perIp, "10.1.1.1"), true);
assert.equal(oneShot(perIp, "10.1.1.2"), true);

// Headers on allowed request
const hdrLimiter = createRateLimiter({
  namespace: "hdr",
  windowMs,
  max: 5,
});
const hReq = { ip: "10.2.2.2", socket: {} };
const hHeaders = {};
const hRes = {
  setHeader(k, v) {
    hHeaders[k.toLowerCase()] = String(v);
  },
  status() {
    return this;
  },
  json() {},
};
hdrLimiter(hReq, hRes, () => {});
assert.ok(hHeaders["ratelimit-limit"]);
assert.ok(hHeaders["ratelimit-remaining"]);
assert.ok(hHeaders["ratelimit-reset"]);

// --- APP_TRUST_PROXY parser ---
assert.equal(parseTrustProxy(undefined), false);
assert.equal(parseTrustProxy(""), false);
assert.equal(parseTrustProxy("false"), false);
assert.equal(parseTrustProxy("true"), true);
assert.equal(parseTrustProxy("1"), 1);
assert.equal(parseTrustProxy("2"), 2);
assert.throws(() => parseTrustProxy("abc"), /Invalid APP_TRUST_PROXY/);
assert.throws(() => parseTrustProxy("0"), /Invalid APP_TRUST_PROXY/);

// --- keyGenerator: separate buckets per email at same IP ---
const kgWindow = 60_000;
const kgMax = 2;
const kgLimiter = createRateLimiter({
  namespace: "kg",
  windowMs: kgWindow,
  max: kgMax,
  keyGenerator(req) {
    const ip = req.ip || "unknown";
    const em =
      typeof req.body?.email === "string" ? req.body.email : "no-email";
    return `${ip}:${em}`;
  },
});

function kgTry(req) {
  let nexted = false;
  const res = {
    setHeader() {},
    status(c) {
      this.code = c;
      return this;
    },
    json() {},
  };
  kgLimiter(req, res, () => {
    nexted = true;
  });
  return { nexted, code: res.code };
}

const ipA = "192.0.2.10";
assert.equal(kgTry({ ip: ipA, body: { email: "u1@test.local" } }).nexted, true);
assert.equal(kgTry({ ip: ipA, body: { email: "u2@test.local" } }).nexted, true);
assert.equal(kgTry({ ip: ipA, body: { email: "u2@test.local" } }).nexted, true);
const kgBlock = kgTry({ ip: ipA, body: { email: "u2@test.local" } });
assert.equal(kgBlock.nexted, false);
assert.equal(kgBlock.code, 429);

// Same email, different IP: not blocked by u2's exhausted bucket at ipA
assert.equal(
  kgTry({ ip: "192.0.2.11", body: { email: "u2@test.local" } }).nexted,
  true
);

// Without keyGenerator: prior tests (namespace, IP-only) unchanged above

console.log("security-hardening-contract: OK");
