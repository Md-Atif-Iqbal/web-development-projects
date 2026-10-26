// Fixed-window in-memory rate limiter (MVP substitute for Redis).
// Suitable for a single-node deployment. Keyed by ip+route or userId+route.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Periodically purge stale buckets to avoid unbounded growth
let lastSweep = Date.now();
function sweep(now: number) {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt < now) buckets.delete(key);
  }
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number
): { allowed: boolean; remaining: number; retryAfterSec: number } {
  const now = Date.now();
  sweep(now);
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterSec: 0 };
  }
  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, retryAfterSec: 0 };
}

// Sensible presets
export const RATE = {
  login: { limit: 10, windowMs: 60_000 },
  register: { limit: 5, windowMs: 60_000 },
  forgotPassword: { limit: 5, windowMs: 15 * 60_000 }, // per IP — anti-abuse
  forgotPasswordEmail: { limit: 3, windowMs: 15 * 60_000 }, // per email — anti-mail-bombing
  passwordReset: { limit: 10, windowMs: 15 * 60_000 }, // per IP — token brute-force guard
  checkout: { limit: 20, windowMs: 60_000 },
  paymentAction: { limit: 30, windowMs: 60_000 },
  review: { limit: 10, windowMs: 60_000 },
  genericWrite: { limit: 60, windowMs: 60_000 },
  newsletter: { limit: 5, windowMs: 60_000 }, // per IP — anti-abuse for public subscribe endpoint
} as const;
