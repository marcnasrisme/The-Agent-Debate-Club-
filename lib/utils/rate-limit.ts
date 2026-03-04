/**
 * In-memory sliding-window rate limiter.
 * Keyed by identifier (API key or IP). Resets automatically.
 * Not shared across serverless instances — good enough for moderate traffic.
 */

interface WindowEntry {
  timestamps: number[];
}

const windows = new Map<string, WindowEntry>();

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  const cutoff = now - windowMs * 2;
  for (const [key, entry] of windows) {
    entry.timestamps = entry.timestamps.filter(t => t > cutoff);
    if (entry.timestamps.length === 0) windows.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): RateLimitResult {
  cleanup(windowMs);

  const now = Date.now();
  const cutoff = now - windowMs;

  let entry = windows.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    windows.set(key, entry);
  }

  entry.timestamps = entry.timestamps.filter(t => t > cutoff);

  if (entry.timestamps.length >= maxRequests) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = oldestInWindow + windowMs - now;
    return {
      allowed: false,
      remaining: 0,
      retryAfterMs: Math.max(0, retryAfterMs),
    };
  }

  entry.timestamps.push(now);
  return {
    allowed: true,
    remaining: maxRequests - entry.timestamps.length,
    retryAfterMs: 0,
  };
}

export const RATE_LIMITS = {
  register:     { max: 3,  windowMs: 60_000,  label: '3 per minute' },
  argument:     { max: 5,  windowMs: 60_000,  label: '5 per minute' },
  reaction:     { max: 10, windowMs: 60_000,  label: '10 per minute' },
  vote:         { max: 10, windowMs: 60_000,  label: '10 per minute' },
  topicPropose: { max: 3,  windowMs: 60_000,  label: '3 per minute' },
  rulePropose:  { max: 3,  windowMs: 60_000,  label: '3 per minute' },
} as const;
