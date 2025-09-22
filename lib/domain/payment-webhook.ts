import type { BookingStatus } from "./types";

type PaymentStatus = "initiated" | "succeeded" | "failed" | "refunded";
export type PaymentEventType = "payment.succeeded" | "payment.failed";

export interface PaymentRecordSnapshot {
  status: PaymentStatus;
}

export interface BookingSnapshot {
  status: BookingStatus;
}

export interface PaymentWebhookResolution {
  nextPaymentStatus: PaymentStatus;
  shouldUpdatePayment: boolean;
  shouldConfirmBooking: boolean;
  shouldCreateReceiptNotification: boolean;
  alreadyProcessed: boolean;
  message: string;
}

export function resolvePaymentEvent(params: {
  eventType: PaymentEventType;
  payment: PaymentRecordSnapshot;
  booking?: BookingSnapshot | null;
}): PaymentWebhookResolution {
  const { eventType, payment, booking } = params;

  if (eventType === "payment.succeeded") {
    if (payment.status === "succeeded") {
      return {
        nextPaymentStatus: "succeeded",
        shouldUpdatePayment: false,
        shouldConfirmBooking: false,
        shouldCreateReceiptNotification: false,
        alreadyProcessed: true,
        message: "Payment already marked as succeeded.",
      };
    }

    const canConfirmBooking = Boolean(booking && booking.status !== "confirmed");

    return {
      nextPaymentStatus: "succeeded",
      shouldUpdatePayment: true,
      shouldConfirmBooking: canConfirmBooking,
      shouldCreateReceiptNotification: canConfirmBooking,
      alreadyProcessed: false,
      message: canConfirmBooking
        ? "Payment succeeded. Booking will transition to confirmed."
        : "Payment succeeded without a pending booking to confirm.",
    };
  }

  // payment.failed
  if (payment.status === "failed") {
    return {
      nextPaymentStatus: "failed",
      shouldUpdatePayment: false,
      shouldConfirmBooking: false,
      shouldCreateReceiptNotification: false,
      alreadyProcessed: true,
      message: "Payment already marked as failed.",
    };
  }

  if (payment.status === "succeeded") {
    return {
      nextPaymentStatus: "succeeded",
      shouldUpdatePayment: false,
      shouldConfirmBooking: false,
      shouldCreateReceiptNotification: false,
      alreadyProcessed: true,
      message: "Ignoring failure event for a succeeded payment.",
    };
  }

  return {
    nextPaymentStatus: "failed",
    shouldUpdatePayment: true,
    shouldConfirmBooking: false,
    shouldCreateReceiptNotification: false,
    alreadyProcessed: false,
    message: "Payment marked as failed.",
  };
}
