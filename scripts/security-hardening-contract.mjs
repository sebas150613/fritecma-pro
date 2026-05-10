/**
 * Contract checks for rate limiting and loopback host detection (no extra deps).
 */
import assert from "node:assert/strict";
import { createRateLimiter } from "../server/lib/rate-limit.js";
import { isLoopbackHost } from "../server/lib/network-host.js";

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
  Number(resultsSmall[maxSmall].headers["x-ratelimit-limit"]) === maxSmall
);

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
assert.ok(hHeaders["x-ratelimit-limit"]);
assert.ok(hHeaders["x-ratelimit-remaining"]);
assert.ok(hHeaders["x-ratelimit-reset"]);

console.log("security-hardening-contract: OK");
