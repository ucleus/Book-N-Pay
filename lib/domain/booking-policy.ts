import { differenceInMinutes } from "date-fns";

export interface CancellationPolicyInput {
  bookingStartAt: string;
  lateCancelHours: number;
  now?: Date;
}

export interface CancellationPolicyResult {
  isLate: boolean;
  refundEligible: boolean;
  minutesUntilStart: number;
}

export function evaluateCancellationPolicy({
  bookingStartAt,
  lateCancelHours,
  now = new Date(),
}: CancellationPolicyInput): CancellationPolicyResult {
  const startAt = new Date(bookingStartAt);

  if (Number.isNaN(startAt.getTime())) {
    throw new Error("INVALID_START_AT");
  }

  const minutesUntilStart = differenceInMinutes(startAt, now);
  const cutoffMinutes = Math.max(0, lateCancelHours) * 60;
  const refundEligible = minutesUntilStart >= cutoffMinutes;

  return {
    isLate: !refundEligible,
    refundEligible,
    minutesUntilStart,
  };
}
