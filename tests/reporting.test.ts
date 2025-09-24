import { describe, expect, it } from "vitest";
import { calculateConversionRate } from "@/lib/domain/reporting";

describe("calculateConversionRate", () => {
  it("returns 0 when there are no bookings", () => {
    expect(calculateConversionRate(0, 0)).toBe(0);
    expect(calculateConversionRate(0, 5)).toBe(0);
  });

  it("returns a whole number percentage when evenly divisible", () => {
    expect(calculateConversionRate(5, 10)).toBe(50);
  });

  it("rounds to one decimal place for fractional values", () => {
    expect(calculateConversionRate(3, 7)).toBeCloseTo(42.9, 5);
    expect(calculateConversionRate(2, 3)).toBeCloseTo(66.7, 5);
  });
});
