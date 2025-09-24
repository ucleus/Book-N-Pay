import { describe, expect, it } from "vitest";
import { evaluateCancellationPolicy } from "@/lib/domain/booking-policy";

describe("evaluateCancellationPolicy", () => {
  it("allows refunds when cancelling before the cutoff", () => {
    const now = new Date("2024-03-01T08:00:00Z");
    const startAt = new Date("2024-03-02T08:00:00Z");

    const result = evaluateCancellationPolicy({
      bookingStartAt: startAt.toISOString(),
      lateCancelHours: 12,
      now,
    });

    expect(result.refundEligible).toBe(true);
    expect(result.isLate).toBe(false);
  });

  it("flags late cancellations inside the cutoff", () => {
    const now = new Date("2024-03-01T20:00:00Z");
    const startAt = new Date("2024-03-02T08:00:00Z");

    const result = evaluateCancellationPolicy({
      bookingStartAt: startAt.toISOString(),
      lateCancelHours: 12,
      now,
    });

    expect(result.refundEligible).toBe(false);
    expect(result.isLate).toBe(true);
  });
});
