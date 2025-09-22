import { addDays, addMinutes, isBefore, isEqual, parseISO, set } from "date-fns";
import type { AvailabilityRule, BlackoutDate } from "./types";

export interface AvailabilitySlot {
  start: string;
  end: string;
}

export interface SlotGenerationOptions {
  rules: AvailabilityRule[];
  blackoutDates: BlackoutDate[];
  serviceDurationMin: number;
  from?: string;
  days?: number;
}

const DEFAULT_LOOKAHEAD_DAYS = 14;

function parseTime(time: string) {
  const [hours, minutes] = time.split(":").map((part) => Number.parseInt(part, 10));
  return { hours, minutes };
}

function isBlackout(day: Date, blackoutDates: BlackoutDate[]) {
  const dayStr = day.toISOString().slice(0, 10);
  return blackoutDates.some((b) => b.day === dayStr);
}

export function generateBookableSlots(options: SlotGenerationOptions): AvailabilitySlot[] {
  const { rules, blackoutDates, serviceDurationMin, from, days } = options;
  const start = from ? parseISO(from) : new Date();
  const lookahead = days ?? DEFAULT_LOOKAHEAD_DAYS;
  const slots: AvailabilitySlot[] = [];

  for (let offset = 0; offset < lookahead; offset += 1) {
    const day = addDays(new Date(start), offset);
    if (isBlackout(day, blackoutDates)) {
      continue;
    }
    const dow = day.getDay();
    const dayRules = rules.filter((rule) => rule.dow === dow);
    if (dayRules.length === 0) {
      continue;
    }

    for (const rule of dayRules) {
      const { hours: startHour, minutes: startMinute } = parseTime(rule.startTime);
      const { hours: endHour, minutes: endMinute } = parseTime(rule.endTime);

      const windowStart = set(day, {
        hours: startHour,
        minutes: startMinute,
        seconds: 0,
        milliseconds: 0,
      });
      const windowEnd = set(day, {
        hours: endHour,
        minutes: endMinute,
        seconds: 0,
        milliseconds: 0,
      });

      let cursor = new Date(windowStart);
      while (isBefore(addMinutes(cursor, serviceDurationMin), addMinutes(windowEnd, 1)) || isEqual(addMinutes(cursor, serviceDurationMin), windowEnd)) {
        if (isBefore(cursor, start)) {
          cursor = addMinutes(cursor, serviceDurationMin);
          continue;
        }
        const end = addMinutes(cursor, serviceDurationMin);
        if (isBefore(end, windowEnd) || isEqual(end, windowEnd)) {
          slots.push({ start: cursor.toISOString(), end: end.toISOString() });
        }
        cursor = addMinutes(cursor, serviceDurationMin);
      }
    }
  }

  return slots;
}
