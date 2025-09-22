import { describe, expect, it } from "vitest";
import { generateBookableSlots } from "@/lib/domain/availability";

const rules = [
  { id: "r1", providerId: "p1", dow: 1, startTime: "09:00", endTime: "11:00" },
  { id: "r2", providerId: "p1", dow: 2, startTime: "09:00", endTime: "10:00" },
];

const blackoutDates = [{ id: "b1", providerId: "p1", day: "2024-01-02", reason: "Holiday" }];

describe("generateBookableSlots", () => {
  it("creates slots within availability windows", () => {
    const slots = generateBookableSlots({
      rules,
      blackoutDates: [],
      serviceDurationMin: 30,
      from: "2024-01-01T08:00:00Z",
      days: 2,
    });

    expect(slots.length).toBeGreaterThan(0);
    expect(slots.every((slot) => slot.end > slot.start)).toBe(true);
  });

  it("respects blackout dates", () => {
    const slots = generateBookableSlots({
      rules,
      blackoutDates,
      serviceDurationMin: 30,
      from: "2024-01-01T08:00:00Z",
      days: 2,
    });

    expect(slots.every((slot) => !slot.start.startsWith("2024-01-02"))).toBe(true);
  });
});
