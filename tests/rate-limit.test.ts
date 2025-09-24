import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { applyRateLimit, resetRateLimit } from "@/lib/server/rate-limit";

describe("applyRateLimit", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetRateLimit();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the configured limit", () => {
    const result = applyRateLimit({ key: "test", limit: 2, windowMs: 1000 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);
  });

  it("blocks requests beyond the limit until the window resets", () => {
    applyRateLimit({ key: "burst", limit: 1, windowMs: 1000 });
    const denied = applyRateLimit({ key: "burst", limit: 1, windowMs: 1000 });
    expect(denied.allowed).toBe(false);
    if (denied.allowed) {
      throw new Error("Expected the second call to be rate limited");
    }
    expect("retryAfterMs" in denied ? denied.retryAfterMs : 0).toBeGreaterThanOrEqual(0);

    vi.advanceTimersByTime(1000);

    const allowedAgain = applyRateLimit({ key: "burst", limit: 1, windowMs: 1000 });
    expect(allowedAgain.allowed).toBe(true);
  });
});
