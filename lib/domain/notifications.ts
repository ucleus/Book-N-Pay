import { format } from "date-fns";
import { z } from "zod";

const DATE_FORMAT = "eee, MMM d 'at' h:mmaaa";
const currencyFormatter = new Intl.NumberFormat("en-JM", {
  style: "currency",
  currency: "JMD",
  minimumFractionDigits: 0,
});

function safeFormatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return format(date, DATE_FORMAT);
}

function formatCurrency(amountCents: number): string {
  return currencyFormatter.format(amountCents / 100);
}

const baseCustomerPayload = z.object({
  providerName: z.string(),
  serviceName: z.string(),
  customerName: z.string().optional(),
});

export const notificationPayloadSchema = z.discriminatedUnion("type", [
  z
    .object({
      type: z.literal("booking_customer_pending"),
      bookingId: z.string().uuid(),
      providerHandle: z.string(),
      startAt: z.string(),
    })
    .merge(baseCustomerPayload),
  z
    .object({
      type: z.literal("booking_customer_confirmed"),
      bookingId: z.string().uuid(),
      startAt: z.string(),
    })
    .merge(baseCustomerPayload),
  z
    .object({
      type: z.literal("booking_customer_cancelled"),
      cancelledBy: z.enum(["provider", "customer"]),
      startAt: z.string(),
      refundIssued: z.boolean(),
    })
    .merge(baseCustomerPayload),
  z
    .object({
      type: z.literal("booking_customer_rescheduled"),
      previousStartAt: z.string(),
      newStartAt: z.string(),
      feeCharged: z.boolean(),
    })
    .merge(baseCustomerPayload),
  z.object({
    type: z.literal("per_booking_receipt"),
    bookingId: z.string().uuid(),
    amountCents: z.number().nonnegative(),
    providerName: z.string(),
    serviceName: z.string().optional(),
  }),
  z.object({
    type: z.literal("provider_low_credits_warning"),
    providerName: z.string(),
    creditsRemaining: z.number().int().nonnegative(),
  }),
]);

export type NotificationPayload = z.infer<typeof notificationPayloadSchema>;

export function parseNotificationPayload(payload: unknown): NotificationPayload | null {
  const parsed = notificationPayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }
  return parsed.data;
}

export function renderEmailTemplate(payload: NotificationPayload): { subject: string; body: string } {
  switch (payload.type) {
    case "booking_customer_pending": {
      const greeting = payload.customerName ? `Hi ${payload.customerName},` : "Hi there,";
      return {
        subject: `We got your request for ${payload.serviceName}`,
        body: [
          greeting,
          `\n`,
          `${payload.providerName} received your booking for ${payload.serviceName} on ${safeFormatDate(payload.startAt)}.`,
          " We'll reach out once it's confirmed.",
          "\n\n",
          `Need to make changes? Reply here or visit booknpay.com/@${payload.providerHandle}.`,
        ].join(""),
      };
    }
    case "booking_customer_confirmed": {
      const greeting = payload.customerName ? `Hi ${payload.customerName},` : "Hi there,";
      return {
        subject: `You're booked with ${payload.providerName}`,
        body: [
          greeting,
          "\n",
          `Your ${payload.serviceName} appointment is confirmed for ${safeFormatDate(payload.startAt)}.`,
          "\n\n",
          "See you soon!",
        ].join(""),
      };
    }
    case "booking_customer_cancelled": {
      const greeting = payload.customerName ? `Hi ${payload.customerName},` : "Hi there,";
      const whoCancelled = payload.cancelledBy === "provider" ? payload.providerName : "you";
      const refundLine = payload.refundIssued
        ? "Any fees paid have been refunded."
        : "This appointment won't be billed.";
      return {
        subject: `Booking cancelled — ${payload.serviceName}`,
        body: [
          greeting,
          "\n",
          `${payload.serviceName} on ${safeFormatDate(payload.startAt)} was cancelled by ${whoCancelled}.`,
          "\n",
          refundLine,
        ].join(""),
      };
    }
    case "booking_customer_rescheduled": {
      const greeting = payload.customerName ? `Hi ${payload.customerName},` : "Hi there,";
      const feeLine = payload.feeCharged
        ? "A small reschedule fee was applied and shows on your receipt."
        : "No extra fees were charged.";
      return {
        subject: `New time for ${payload.serviceName}`,
        body: [
          greeting,
          "\n",
          `${payload.providerName} moved your ${payload.serviceName} from ${safeFormatDate(payload.previousStartAt)} to ${safeFormatDate(payload.newStartAt)}.`,
          "\n",
          feeLine,
        ].join(""),
      };
    }
    case "per_booking_receipt": {
      const amount = formatCurrency(payload.amountCents);
      return {
        subject: `Receipt — ${payload.providerName}`,
        body: [
          `Thanks for booking with ${payload.providerName}.`,
          "\n",
          `We received ${amount}`,
          payload.serviceName ? ` for ${payload.serviceName}.` : ".",
          "\n",
          "See you soon!",
        ].join(""),
      };
    }
    case "provider_low_credits_warning": {
      return {
        subject: `Heads up — only ${payload.creditsRemaining} credits left`,
        body: [
          `Hi ${payload.providerName},`,
          "\n",
          `You're down to ${payload.creditsRemaining} booking credit${payload.creditsRemaining === 1 ? "" : "s"}.`,
          " Top up to keep confirming bookings without interruption.",
        ].join(""),
      };
    }
    default: {
      const exhaustiveCheck: never = payload;
      return exhaustiveCheck;
    }
  }
}

export function renderWhatsAppTemplate(payload: NotificationPayload): string {
  switch (payload.type) {
    case "booking_customer_pending":
      return `✅ ${payload.providerName} got your request for ${payload.serviceName} on ${safeFormatDate(payload.startAt)}. We'll confirm shortly.`;
    case "booking_customer_confirmed":
      return `🎉 Confirmed! ${payload.serviceName} with ${payload.providerName} on ${safeFormatDate(payload.startAt)}.`;
    case "booking_customer_cancelled":
      return `⚠️ ${payload.serviceName} on ${safeFormatDate(payload.startAt)} was cancelled. ${payload.refundIssued ? "Any payments have been refunded." : "No charges will apply."}`;
    case "booking_customer_rescheduled":
      return `🔁 New time: ${payload.serviceName} now starts ${safeFormatDate(payload.newStartAt)} (was ${safeFormatDate(payload.previousStartAt)}).`;
    case "per_booking_receipt": {
      const amount = formatCurrency(payload.amountCents);
      return `🧾 Receipt: ${amount} received for ${payload.serviceName ?? "your booking"} with ${payload.providerName}.`;
    }
    case "provider_low_credits_warning":
      return `⚡ ${payload.providerName}, you have ${payload.creditsRemaining} booking credit${payload.creditsRemaining === 1 ? "" : "s"} left. Top up soon!`;
    default: {
      const exhaustiveCheck: never = payload;
      return exhaustiveCheck;
    }
  }
}
