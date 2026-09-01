/**
 * Basic in-memory, fixed-window rate limiter - no new dependency. Good
 * enough for a single-instance deployment (this project runs on one
 * Railway instance); a multi-instance deployment would need a shared
 * store (e.g. Redis) since each instance would otherwise count
 * independently.
 */

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 100;

function createRateLimiter({ windowMs = DEFAULT_WINDOW_MS, max = DEFAULT_MAX_REQUESTS } = {}) {
  // Scoped to this limiter instance (not module-level) so each
  // app.use(createRateLimiter()) - and each test - gets independent state.
  const hits = new Map();

  return function rateLimiter(req, res, next) {
    const key = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();
    const entry = hits.get(key);

    if (!entry || now - entry.windowStart >= windowMs) {
      hits.set(key, { count: 1, windowStart: now });
      return next();
    }

    entry.count += 1;

    if (entry.count > max) {
      const retryAfterSeconds = Math.ceil((entry.windowStart + windowMs - now) / 1000);
      res.setHeader('Retry-After', String(Math.max(retryAfterSeconds, 1)));
      return res.status(429).json({
        error: 'Too Many Requests',
        message: `Rate limit exceeded: max ${max} requests per ${windowMs / 1000}s`,
      });
    }

    return next();
  };
}

module.exports = { createRateLimiter };
