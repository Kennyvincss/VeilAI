/**
 * Sliding-window rate limiter.
 *
 * In-memory per server instance. On Vercel each warm function instance keeps
 * its own window, which bounds abuse per instance; for strict global limits
 * plug in a shared store (see docs/SECURITY.md). The interface is kept small
 * so a Redis/Upstash implementation can replace it.
 */

interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
  sweep(now, windowMs);
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    const oldest = bucket.hits[0];
    buckets.set(key, bucket);
    return { ok: false, remaining: 0, retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)) };
  }
  bucket.hits.push(now);
  buckets.set(key, bucket);
  return { ok: true, remaining: limit - bucket.hits.length, retryAfterSec: 0 };
}

function sweep(now: number, windowMs: number) {
  if (now - lastSweep < 60_000 && buckets.size < 10_000) return;
  lastSweep = now;
  for (const [k, b] of buckets) {
    if (b.hits.every((t) => now - t >= Math.max(windowMs, 3_600_000))) buckets.delete(k);
  }
}

export function __resetRateLimitsForTests() {
  buckets.clear();
}

/** Named policies so limits are consistent and documented in one place. */
export const RATE_LIMITS = {
  aiChat: { limit: 20, windowMs: 10 * 60_000 },
  aiChatAnonymous: { limit: 6, windowMs: 10 * 60_000 },
  attestation: { limit: 6, windowMs: 5 * 60_000 },
  walletIntel: { limit: 12, windowMs: 5 * 60_000 },
  portfolio: { limit: 30, windowMs: 5 * 60_000 },
  reports: { limit: 10, windowMs: 10 * 60_000 },
  mutations: { limit: 60, windowMs: 10 * 60_000 },
} as const;
