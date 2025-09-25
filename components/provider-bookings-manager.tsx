"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { format } from "date-fns";
import type { ProviderBookingListItem } from "@/lib/domain/bookings";

type FeedbackState = { type: "success" | "error" | "info"; message: string } | null;

type LoadingState =
  | { type: "confirm" | "cancel"; id: string }
  | { type: "reschedule"; id: string }
  | null;

interface ProviderBookingsManagerProps {
  providerId: string;
  providerCurrency: string;
  initialPending: ProviderBookingListItem[];
  initialUpcoming: ProviderBookingListItem[];
  initialRecent: ProviderBookingListItem[];
}

interface RescheduleFormState {
  when: string;
  chargeFee: boolean;
  note: string;
}

function sortByStartAt(bookings: ProviderBookingListItem[]): ProviderBookingListItem[] {
  return [...bookings].sort(
    (a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime(),
  );
}

function updateBooking(
  bookings: ProviderBookingListItem[],
  bookingId: string,
  updater: (booking: ProviderBookingListItem) => ProviderBookingListItem,
): ProviderBookingListItem[] {
  let changed = false;
  const next = bookings.map((booking) => {
    if (booking.id !== bookingId) {
      return booking;
    }
    changed = true;
    return updater(booking);
  });

  return changed ? next : bookings;
}

function removeBooking(bookings: ProviderBookingListItem[], bookingId: string): ProviderBookingListItem[] {
  return bookings.filter((booking) => booking.id !== bookingId);
}

function toDateTimeLocalValue(iso: string): string {
  const date = new Date(iso);
  const timezoneOffsetMinutes = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - timezoneOffsetMinutes * 60 * 1000);
  return localDate.toISOString().slice(0, 16);
}

function describeStatus(status: ProviderBookingListItem["status"]): string {
  switch (status) {
    case "pending":
      return "Pending confirmation";
    case "confirmed":
      return "Confirmed";
    case "cancelled":
      return "Cancelled";
    case "completed":
      return "Completed";
    case "no_show":
      return "No-show";
    default:
      return status;
  }
}

export function ProviderBookingsManager({
  providerId,
  providerCurrency,
  initialPending,
  initialUpcoming,
  initialRecent,
}: ProviderBookingsManagerProps) {
  const [pending, setPending] = useState(() => sortByStartAt(initialPending));
  const [upcoming, setUpcoming] = useState(() => sortByStartAt(initialUpcoming));
  const [recent, setRecent] = useState(initialRecent);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [loading, setLoading] = useState<LoadingState>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<ProviderBookingListItem | null>(null);
  const [rescheduleForm, setRescheduleForm] = useState<RescheduleFormState>({
    when: "",
    chargeFee: false,
    note: "",
  });

  useEffect(() => {
    if (rescheduleTarget) {
      setRescheduleForm({
        when: toDateTimeLocalValue(rescheduleTarget.startAt),
        chargeFee: false,
        note: "",
      });
    }
  }, [rescheduleTarget]);

  const currencyFormatter = useMemo(
    () =>
      new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: providerCurrency || "JMD",
        minimumFractionDigits: 0,
      }),
    [providerCurrency],
  );

  function handleError(message: string) {
    setFeedback({ type: "error", message });
  }

  async function confirmBooking(booking: ProviderBookingListItem) {
    setFeedback(null);
    setLoading({ type: "confirm", id: booking.id });

    try {
      const response = await fetch("/api/booking/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId: booking.id, providerId }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          (payload && typeof payload.error === "string" && payload.error) ||
          "Unable to confirm booking";
        handleError(message);
        return;
      }

      if (payload?.status === "requires_payment") {
        setFeedback({
          type: "info",
          message:
            payload.checkoutUrl
              ? `This booking needs payment before confirmation. Share the checkout link: ${payload.checkoutUrl}`
              : payload.message || "This booking needs payment before confirmation.",
        });
        return;
      }

      setPending((list) => removeBooking(list, booking.id));
      const updatedBooking: ProviderBookingListItem = {
        ...booking,
        status: "confirmed",
        payMode: "credit",
      };
      setUpcoming((list) => sortByStartAt([...removeBooking(list, booking.id), updatedBooking]));
      setFeedback({ type: "success", message: "Booking confirmed." });
    } catch (error) {
      console.error(error);
      handleError("Unexpected error confirming booking");
    } finally {
      setLoading((current) => (current?.id === booking.id ? null : current));
    }
  }

  async function cancelBooking(booking: ProviderBookingListItem, actor: "pending" | "upcoming") {
    const reason = window.prompt("Add a note for this cancellation (optional)") ?? undefined;
    setFeedback(null);
    setLoading({ type: "cancel", id: booking.id });

    try {
      const response = await fetch("/api/booking/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: booking.id,
          providerId,
          reason: reason?.trim() ? reason.trim() : undefined,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          (payload && typeof payload.error === "string" && payload.error) ||
          "Unable to cancel booking";
        handleError(message);
        return;
      }

      if (actor === "pending") {
        setPending((list) => removeBooking(list, booking.id));
      } else {
        setUpcoming((list) => removeBooking(list, booking.id));
      }

      const cancelled: ProviderBookingListItem = { ...booking, status: "cancelled" };
      setRecent((list) => {
        const filtered = list.filter((entry) => entry.id !== booking.id);
        return [cancelled, ...filtered].slice(0, 20);
      });

      const details: string[] = ["Booking cancelled."];
      if (payload?.refundIssued) {
        details.push("A refund has been recorded.");
      }
      if (payload?.lateCancellation) {
        details.push("This was a late cancellation.");
      }
      setFeedback({ type: "success", message: details.join(" ") });
    } catch (error) {
      console.error(error);
      handleError("Unexpected error cancelling booking");
    } finally {
      setLoading((current) => (current?.id === booking.id ? null : current));
    }
  }

  async function submitReschedule(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!rescheduleTarget) return;

    if (!rescheduleForm.when) {
      handleError("Please choose a new start time.");
      return;
    }

    const isoStart = new Date(rescheduleForm.when);
    if (Number.isNaN(isoStart.getTime())) {
      handleError("Invalid date provided. Use the picker to select a valid time.");
      return;
    }

    setFeedback(null);
    setLoading({ type: "reschedule", id: rescheduleTarget.id });

    try {
      const response = await fetch("/api/booking/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookingId: rescheduleTarget.id,
          providerId,
          newStartAt: isoStart.toISOString(),
          chargeCustomerFee: rescheduleForm.chargeFee || undefined,
          note: rescheduleForm.note.trim() ? rescheduleForm.note.trim() : undefined,
        }),
      });

      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          (payload && typeof payload.error === "string" && payload.error) ||
          "Unable to reschedule booking";
        handleError(message);
        return;
      }

      const updates = (booking: ProviderBookingListItem): ProviderBookingListItem => ({
        ...booking,
        startAt: payload?.startAt ?? booking.startAt,
        endAt: payload?.endAt ?? booking.endAt,
      });

      setPending((list) => sortByStartAt(updateBooking(list, rescheduleTarget.id, updates)));
      setUpcoming((list) => sortByStartAt(updateBooking(list, rescheduleTarget.id, updates)));

      const noteSegments: string[] = ["Booking rescheduled."];
      if (payload?.feeCharged) {
        noteSegments.push("Reschedule fee recorded.");
      }

      setFeedback({ type: "success", message: noteSegments.join(" ") });
      setRescheduleTarget(null);
    } catch (error) {
      console.error(error);
      handleError("Unexpected error rescheduling booking");
    } finally {
      setLoading(null);
    }
  }

  function renderBookingRow(
    booking: ProviderBookingListItem,
    actor: "pending" | "upcoming",
  ) {
    const isConfirming = loading?.type === "confirm" && loading.id === booking.id;
    const isCancelling = loading?.type === "cancel" && loading.id === booking.id;
    const isRescheduling = loading?.type === "reschedule" && loading.id === booking.id;

    const baseActions = (
      <div className="flex flex-wrap gap-2">
        {actor === "pending" ? (
          <button
            type="button"
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            onClick={() => confirmBooking(booking)}
            disabled={isConfirming || isCancelling || isRescheduling}
          >
            {isConfirming ? "Confirming..." : "Confirm"}
          </button>
        ) : null}
        <button
          type="button"
          className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-red-500 hover:bg-red-500/10 hover:text-red-300 disabled:opacity-60"
          onClick={() => cancelBooking(booking, actor)}
          disabled={isConfirming || isCancelling || isRescheduling}
        >
          {isCancelling ? "Cancelling..." : "Cancel"}
        </button>
        {actor === "upcoming" ? (
          <button
            type="button"
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs font-semibold text-slate-200 transition hover:border-accent hover:bg-accent/10 hover:text-accent disabled:opacity-60"
            onClick={() => setRescheduleTarget(booking)}
            disabled={isConfirming || isCancelling || isRescheduling}
          >
            Reschedule
          </button>
        ) : null}
      </div>
    );

    return (
      <tr key={booking.id} className="border-b border-slate-800/60">
        <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-200">
          {format(new Date(booking.startAt), "EEE, MMM d • h:mma")}
        </td>
        <td className="px-3 py-3 text-sm text-slate-300">
          <div className="font-semibold text-white">{booking.serviceName}</div>
          <div className="text-xs text-slate-500">
            {booking.serviceDurationMin ? `${booking.serviceDurationMin} min` : "Duration TBD"}
          </div>
        </td>
        <td className="px-3 py-3 text-sm text-slate-300">
          <div className="font-semibold text-white">{booking.customerName}</div>
          <div className="text-xs text-slate-500">
            {[booking.customerEmail, booking.customerPhone].filter(Boolean).join(" • ") || "Contact missing"}
          </div>
        </td>
        <td className="px-3 py-3 text-sm text-slate-300">
          {booking.servicePriceCents != null
            ? currencyFormatter.format(booking.servicePriceCents / 100)
            : "—"}
        </td>
        <td className="px-3 py-3 text-sm text-slate-300">{baseActions}</td>
      </tr>
    );
  }

  return (
    <div className="space-y-8">
      {feedback ? (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            feedback.type === "success"
              ? "border-emerald-700 bg-emerald-500/10 text-emerald-200"
              : feedback.type === "error"
              ? "border-red-700 bg-red-500/10 text-red-200"
              : "border-blue-700 bg-blue-500/10 text-blue-200"
          }`}
        >
          {feedback.message}
        </div>
      ) : null}

      <section className="card space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Pending requests</h2>
            <p className="text-sm text-slate-400">
              Review new booking requests and confirm or decline them promptly.
            </p>
          </div>
          <span className="text-xs uppercase tracking-wide text-slate-500">{pending.length} open</span>
        </div>
        {pending.length === 0 ? (
          <p className="text-sm text-slate-400">No pending booking requests at the moment.</p>
        ) : (
          <div className="-mx-3 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800/80">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Service</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>{pending.map((booking) => renderBookingRow(booking, "pending"))}</tbody>
            </table>
          </div>
        )}
      </section>

      <section className="card space-y-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Upcoming schedule</h2>
            <p className="text-sm text-slate-400">
              Confirmed bookings happening soon. Reschedule or cancel if plans change.
            </p>
          </div>
          <span className="text-xs uppercase tracking-wide text-slate-500">{upcoming.length} booked</span>
        </div>
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-400">No confirmed bookings on the horizon. Share your link to fill the calendar.</p>
        ) : (
          <div className="-mx-3 overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800/80">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Service</th>
                  <th className="px-3 py-2">Customer</th>
                  <th className="px-3 py-2">Price</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>{upcoming.map((booking) => renderBookingRow(booking, "upcoming"))}</tbody>
            </table>
          </div>
        )}
      </section>

      {rescheduleTarget ? (
        <section className="card space-y-4">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">
                Reschedule {rescheduleTarget.customerName}&rsquo;s booking
              </h2>
              <p className="text-sm text-slate-400">
                Pick a new start time and optionally add a note for your records.
              </p>
            </div>
            <button
              type="button"
              className="text-sm font-medium text-slate-400 transition hover:text-white"
              onClick={() => setRescheduleTarget(null)}
              disabled={loading?.type === "reschedule"}
            >
              Cancel
            </button>
          </div>
          <form className="space-y-4" onSubmit={submitReschedule}>
            <label className="block text-sm text-slate-300">
              New start time
              <input
                type="datetime-local"
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                value={rescheduleForm.when}
                onChange={(event) => setRescheduleForm((form) => ({ ...form, when: event.target.value }))}
                required
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-300">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border border-slate-700 bg-slate-900"
                checked={rescheduleForm.chargeFee}
                onChange={(event) =>
                  setRescheduleForm((form) => ({ ...form, chargeFee: event.target.checked }))
                }
              />
              Charge reschedule fee if applicable
            </label>
            <label className="block text-sm text-slate-300">
              Internal note
              <textarea
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none"
                rows={3}
                value={rescheduleForm.note}
                onChange={(event) => setRescheduleForm((form) => ({ ...form, note: event.target.value }))}
                placeholder="Optional note that will be saved to the booking"
              />
            </label>
            <div className="flex gap-3">
              <button
                type="submit"
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white transition hover:bg-accent/80 disabled:opacity-60"
                disabled={loading?.type === "reschedule"}
              >
                {loading?.type === "reschedule" ? "Rescheduling..." : "Reschedule booking"}
              </button>
              <button
                type="button"
                className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
                onClick={() => setRescheduleTarget(null)}
                disabled={loading?.type === "reschedule"}
              >
                Never mind
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <section className="card space-y-4">
        <div>
          <h2 className="text-xl font-semibold text-white">Recent activity</h2>
          <p className="text-sm text-slate-400">Latest bookings and status changes.</p>
        </div>
        {recent.length === 0 ? (
          <p className="text-sm text-slate-400">No recent booking activity yet.</p>
        ) : (
          <ul className="space-y-3">
            {recent.map((booking) => (
              <li
                key={`${booking.id}-${booking.createdAt}`}
                className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-950/60 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-white">
                    {booking.customerName} • {booking.serviceName}
                  </p>
                  <p className="text-xs text-slate-400">
                    {format(new Date(booking.startAt), "EEE, MMM d • h:mma")} — {describeStatus(booking.status)}
                  </p>
                </div>
                <p className="text-xs text-slate-500">
                  {booking.payMode === "credit"
                    ? "Confirmed with credits"
                    : booking.payMode === "per_booking"
                    ? "Pay-per-booking"
                    : "Payment pending"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export default ProviderBookingsManager;
