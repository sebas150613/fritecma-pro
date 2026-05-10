/**
 * In-memory fixed-window rate limiter by namespace + client IP.
 */

const getClientIp = (req) => {
  if (req.ip) {
    return String(req.ip);
  }
  const ra = req.socket?.remoteAddress;
  return ra ? String(ra) : "unknown";
};

export function createRateLimiter({ windowMs, max, namespace }) {
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

    const ip = getClientIp(req);
    const key = `${namespace}:${ip}`;
    let entry = store.get(key);

    if (!entry || now >= entry.resetAt) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count += 1;

    const remaining = Math.max(0, max - entry.count);
    const resetUnixSec = Math.ceil(entry.resetAt / 1000);

    res.setHeader("X-RateLimit-Limit", String(max));
    res.setHeader("X-RateLimit-Remaining", String(remaining));
    res.setHeader("X-RateLimit-Reset", String(resetUnixSec));

    if (entry.count > max) {
      const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfterSec));
      res.status(429).json({
        message: "Too many requests. Please retry later.",
      });
      return;
    }

    next();
  };
}
