/**
 * In-memory fixed-window rate limiter by namespace + client IP or custom key.
 */

export const getClientIp = (req) => {
  if (req.ip) {
    return String(req.ip);
  }
  const ra = req.socket?.remoteAddress;
  return ra ? String(ra) : "unknown";
};

function setRateLimitHeaders(res, { max, remaining, resetUnixSec }) {
  const lim = String(max);
  const rem = String(remaining);
  const rst = String(resetUnixSec);
  res.setHeader("RateLimit-Limit", lim);
  res.setHeader("RateLimit-Remaining", rem);
  res.setHeader("RateLimit-Reset", rst);
  res.setHeader("X-RateLimit-Limit", lim);
  res.setHeader("X-RateLimit-Remaining", rem);
  res.setHeader("X-RateLimit-Reset", rst);
}

export function createRateLimiter({ windowMs, max, namespace, keyGenerator }) {
  if (!namespace || typeof namespace !== "string") {
    throw new Error("createRateLimiter requires a non-empty namespace string.");
  }
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error("createRateLimiter requires windowMs > 0.");
  }
  if (!Number.isFinite(max) || max < 1) {
    throw new Error("createRateLimiter requires max >= 1.");
  }

  const store = new Map();

  const pruneExpired = (now) => {
    for (const [key, entry] of store) {
      if (now > entry.resetAt) {
        store.delete(key);
      }
    }
  };

  return function rateLimiter(req, res, next) {
    const now = Date.now();
    pruneExpired(now);

    const keySuffix =
      typeof keyGenerator === "function"
        ? keyGenerator(req)
        : getClientIp(req);
    const key = `${namespace}:${keySuffix}`;
    let entry = store.get(key);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    const resetUnixSec = Math.ceil(entry.resetAt / 1000);

    setRateLimitHeaders(res, {
      max,
      remaining,
      resetUnixSec,
    });

    if (entry.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      setRateLimitHeaders(res, {
        max,
        remaining: 0,
        resetUnixSec,
      });
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        message: "Too many requests. Please retry later.",
      });
      return;
    }

    next();
  };
}
