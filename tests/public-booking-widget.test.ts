import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pickFirstOpenDate } from "@/components/public-booking-widget";
import type { AvailabilityRule, BlackoutDate } from "@/lib/domain/types";

const baseRules: AvailabilityRule[] = [
  { id: "r1", providerId: "p1", dow: 2, startTime: "09:00", endTime: "17:00" },
  { id: "r2", providerId: "p1", dow: 3, startTime: "09:00", endTime: "17:00" },
];

const baseBlackouts: BlackoutDate[] = [];

describe("pickFirstOpenDate", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2024-01-01T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("selects the next day with availability when the first is blacked out", () => {
    const blackoutDates: BlackoutDate[] = [{ id: "b1", providerId: "p1", day: "2024-01-02", reason: "Holiday" }];

    const result = pickFirstOpenDate(baseRules, blackoutDates);

    expect(result).toBe("2024-01-03");
  });

  it("falls back to today if no matching availability exists", () => {
    const closedRules: AvailabilityRule[] = [
      { id: "r3", providerId: "p1", dow: 0, startTime: "09:00", endTime: "17:00" },
    ];

    const result = pickFirstOpenDate(closedRules, baseBlackouts);

    expect(result).toBe("2024-01-01");
  });
});
