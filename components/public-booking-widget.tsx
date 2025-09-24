"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import { addDays, format } from "date-fns";
import { AvailabilitySlotPicker } from "@/components/availability-slot-picker";
import { ServiceList } from "@/components/service-list";
import type { AvailabilitySlot } from "@/lib/domain/availability";
import type { AvailabilityRule, BlackoutDate, ProviderProfile, Service } from "@/lib/domain/types";

interface BookingWidgetProps {
  provider: ProviderProfile;
  services: Service[];
  availability: AvailabilityRule[];
  blackoutDates: BlackoutDate[];
}

interface DayOption {
  label: string;
  value: string;
  disabled: boolean;
}

type SubmissionState =
  | { status: "idle" | "submitting" }
  | { status: "success"; message: string }
  | { status: "error"; message: string };

export function pickFirstOpenDate(availability: AvailabilityRule[], blackoutDates: BlackoutDate[]): string {
  const blackoutSet = new Set(blackoutDates.map((entry) => entry.day));
  const availableDow = new Set(availability.map((rule) => rule.dow));
  const today = new Date();

  for (let index = 0; index < 14; index += 1) {
    const day = addDays(today, index);
    const value = format(day, "yyyy-MM-dd");
    if (!availableDow.has(day.getDay())) {
      continue;
    }
    if (blackoutSet.has(value)) {
      continue;
    }
    return value;
  }

  return format(today, "yyyy-MM-dd");
}

export function PublicBookingWidget({ provider, services, availability, blackoutDates }: BookingWidgetProps) {
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(services[0]?.id ?? null);
  const [selectedDate, setSelectedDate] = useState<string>(() => pickFirstOpenDate(availability, blackoutDates));
  const [slots, setSlots] = useState<AvailabilitySlot[]>([]);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [loadingSlots, setLoadingSlots] = useState<boolean>(false);
  const [selectedSlot, setSelectedSlot] = useState<AvailabilitySlot | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [submission, setSubmission] = useState<SubmissionState>({ status: "idle" });

  const dayOptions = useMemo<DayOption[]>(() => {
    const blackoutSet = new Set(blackoutDates.map((entry) => entry.day));
    const availableDow = new Set(availability.map((rule) => rule.dow));

    return Array.from({ length: 14 }, (_, index) => {
      const day = addDays(new Date(), index);
      const value = format(day, "yyyy-MM-dd");
      const disabled = blackoutSet.has(value) || !availableDow.has(day.getDay());
      return {
        value,
        label: format(day, "EEE MMM d"),
        disabled,
      };
    });
  }, [availability, blackoutDates]);

  const selectedService = useMemo(() => services.find((service) => service.id === selectedServiceId) ?? null, [
    services,
    selectedServiceId,
  ]);

  useEffect(() => {
    if (!selectedService) {
      setSlots([]);
      setSelectedSlot(null);
      return;
    }

    const serviceId = selectedService.id;

    let isCancelled = false;
    async function fetchSlots() {
      setLoadingSlots(true);
      setSlotsError(null);
      setSelectedSlot(null);

      try {
        const response = await fetch("/api/public/booking/check", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            providerHandle: provider.handle,
            serviceId,
            date: selectedDate,
          }),
        });

        if (!response.ok) {
          const body = await response.json().catch(() => ({ error: "Unable to load availability" }));
          throw new Error(body.error ?? "Unable to load availability");
        }

        const data = (await response.json()) as { slots: AvailabilitySlot[] };
        if (!isCancelled) {
          setSlots(data.slots);
        }
      } catch (error) {
        if (!isCancelled) {
          setSlots([]);
          setSlotsError(error instanceof Error ? error.message : "Unable to load availability");
        }
      } finally {
        if (!isCancelled) {
          setLoadingSlots(false);
        }
      }
    }

    fetchSlots();

    return () => {
      isCancelled = true;
    };
  }, [provider.handle, selectedDate, selectedService]);

  const isSubmitDisabled =
    !selectedService ||
    !selectedSlot ||
    !customerName.trim() ||
    !customerEmail.trim() ||
    !customerPhone.trim() ||
    submission.status === "submitting";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedService || !selectedSlot) {
      setSubmission({ status: "error", message: "Select a service and time" });
      return;
    }

    setSubmission({ status: "submitting" });

    const serviceId = selectedService.id;
    const slotStart = selectedSlot.start;

    try {
      const response = await fetch("/api/public/booking/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerHandle: provider.handle,
          serviceId,
          startAt: slotStart,
          customer: {
            name: customerName,
            email: customerEmail,
            phone: customerPhone,
          },
          notes: notes.trim() ? notes.trim() : undefined,
        }),
      });

      const body = await response.json().catch(() => ({ error: "Unable to place booking" }));

      if (!response.ok) {
        throw new Error(body.error ?? "Unable to place booking");
      }

      setSubmission({ status: "success", message: body.message ?? "Booking request received" });
      setSlots((current) => current.filter((slot) => slot.start !== slotStart));
      setSelectedSlot(null);
    } catch (error) {
      setSubmission({ status: "error", message: error instanceof Error ? error.message : "Unable to place booking" });
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">Services</h2>
        <ServiceList
          services={services}
          currency={provider.currency}
          onSelect={(service) => setSelectedServiceId(service.id)}
          selectedServiceId={selectedServiceId ?? undefined}
        />
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">Pick a day</h2>
        <div className="flex flex-wrap gap-2">
          {dayOptions.map((option) => {
            const isSelected = option.value === selectedDate;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setSelectedDate(option.value)}
                disabled={option.disabled}
                className={`rounded-full border px-3 py-1 text-sm transition ${
                  option.disabled
                    ? "cursor-not-allowed border-slate-800 bg-slate-900 text-slate-500"
                    : isSelected
                      ? "border-accent bg-accent/20 text-white"
                      : "border-slate-700 bg-slate-900 hover:border-accent/60"
                }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xl font-semibold text-white">Available slots</h2>
        {slotsError ? <p className="text-sm text-red-400">{slotsError}</p> : null}
        {loadingSlots ? <p className="text-sm text-slate-400">Loading availability…</p> : null}
        {!loadingSlots && !slotsError ? (
          <AvailabilitySlotPicker
            slots={slots}
            onSelect={(slot) => setSelectedSlot(slot)}
          />
        ) : null}
        {selectedService ? (
          <p className="text-xs text-slate-400">
            Each {selectedService.name.toLowerCase()} runs {selectedService.durationMin} minutes. We&apos;ll confirm via email and
            WhatsApp once your provider approves.
          </p>
        ) : null}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold text-white">Your details</h2>
        <form className="space-y-4" onSubmit={handleSubmit}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-slate-200">
              Full name
              <input
                required
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-white focus:border-accent focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-200">
              Email
              <input
                type="email"
                required
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-white focus:border-accent focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-200">
              Phone (WhatsApp)
              <input
                required
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-white focus:border-accent focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-slate-200">
              Notes (optional)
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                className="rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-white focus:border-accent focus:outline-none"
              />
            </label>
          </div>
          <div className="space-y-2">
            <button
              type="submit"
              disabled={isSubmitDisabled}
              className="w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-slate-700"
            >
              {submission.status === "submitting" ? "Sending request…" : "Request booking"}
            </button>
            {submission.status === "error" ? (
              <p className="text-sm text-red-400">{submission.message}</p>
            ) : null}
            {submission.status === "success" ? (
              <p className="text-sm text-emerald-400">{submission.message}</p>
            ) : null}
          </div>
        </form>
      </section>
    </div>
  );
}
