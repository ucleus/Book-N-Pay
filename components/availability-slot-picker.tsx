"use client";

import { useState } from "react";
import { format } from "date-fns";
import type { AvailabilitySlot } from "@/lib/domain/availability";

interface AvailabilitySlotPickerProps {
  slots: AvailabilitySlot[];
  onSelect?: (slot: AvailabilitySlot | null) => void;
}

export function AvailabilitySlotPicker({ slots, onSelect }: AvailabilitySlotPickerProps) {
  const [selected, setSelected] = useState<AvailabilitySlot | null>(null);

  if (slots.length === 0) {
    return <p className="text-sm text-slate-400">No open slots for the next two weeks. Check back soon!</p>;
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {slots.map((slot) => {
        const start = new Date(slot.start);
        const end = new Date(slot.end);
        const label = `${format(start, "EEE MMM d")} • ${format(start, "h:mma")} - ${format(end, "h:mma")}`;
        const isSelected = selected?.start === slot.start;
        return (
          <button
            key={slot.start}
            type="button"
            onClick={() => {
              const nextValue = isSelected ? null : slot;
              setSelected(nextValue);
              onSelect?.(nextValue);
            }}
            className={`rounded-lg border px-3 py-2 text-left text-sm transition ${
              isSelected ? "border-accent bg-accent/20 text-white" : "border-slate-700 bg-slate-900 hover:border-accent/60"
            }`}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
