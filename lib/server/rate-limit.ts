import "server-only";

type RateLimitKey = string;

type RateLimitEntry = {
  timestamps: number[];
  windowMs: number;
  limit: number;
};

type RateLimitOutcome =
  | { allowed: true; remaining: number; limit: number }
  | { allowed: false; remaining: 0; limit: number; retryAfterMs: number };

declare global {
  // eslint-disable-next-line no-var
  var __bookNPayRateLimitStore: Map<RateLimitKey, RateLimitEntry> | undefined;
}

const rateLimitStore = (globalThis.__bookNPayRateLimitStore ??= new Map());

function prune(entry: RateLimitEntry, now: number) {
  const windowStart = now - entry.windowMs;
  entry.timestamps = entry.timestamps.filter((timestamp) => timestamp > windowStart);
}

export interface ApplyRateLimitOptions {
  key: RateLimitKey;
  limit: number;
  windowMs: number;
}

export function applyRateLimit({ key, limit, windowMs }: ApplyRateLimitOptions): RateLimitOutcome {
  const now = Date.now();
  const entry = rateLimitStore.get(key) ?? {
    timestamps: [],
    windowMs,
    limit,
  };

  if (entry.windowMs !== windowMs || entry.limit !== limit) {
    entry.windowMs = windowMs;
    entry.limit = limit;
  }

  prune(entry, now);

  if (entry.timestamps.length >= limit) {
    const earliest = entry.timestamps[0] ?? now;
    const retryAfterMs = Math.max(0, entry.windowMs - (now - earliest));
    rateLimitStore.set(key, entry);
    return { allowed: false, remaining: 0, limit, retryAfterMs };
  }

  entry.timestamps.push(now);
  rateLimitStore.set(key, entry);

  return {
    allowed: true,
    remaining: Math.max(0, limit - entry.timestamps.length),
    limit,
  };
}

export function resetRateLimit(key?: RateLimitKey) {
  if (!key) {
    rateLimitStore.clear();
    return;
  }
  rateLimitStore.delete(key);
}
