import { describe, expect, it } from "vitest";
import { resolvePaymentEvent } from "@/lib/domain/payment-webhook";

describe("resolvePaymentEvent", () => {
  it("requests confirmation when payment succeeds for pending booking", () => {
    const resolution = resolvePaymentEvent({
      eventType: "payment.succeeded",
      payment: { status: "initiated" },
      booking: { status: "pending" },
    });

    expect(resolution).toMatchObject({
      nextPaymentStatus: "succeeded",
      shouldUpdatePayment: true,
      shouldConfirmBooking: true,
      shouldCreateReceiptNotification: true,
      alreadyProcessed: false,
    });
  });

  it("does not reconfirm when booking already confirmed", () => {
    const resolution = resolvePaymentEvent({
      eventType: "payment.succeeded",
      payment: { status: "initiated" },
      booking: { status: "confirmed" },
    });

    expect(resolution.shouldConfirmBooking).toBe(false);
    expect(resolution.shouldCreateReceiptNotification).toBe(false);
  });

  it("ignores duplicate success events", () => {
    const resolution = resolvePaymentEvent({
      eventType: "payment.succeeded",
      payment: { status: "succeeded" },
      booking: { status: "confirmed" },
    });

    expect(resolution.alreadyProcessed).toBe(true);
    expect(resolution.shouldUpdatePayment).toBe(false);
  });

  it("marks payment as failed on failure event", () => {
    const resolution = resolvePaymentEvent({
      eventType: "payment.failed",
      payment: { status: "initiated" },
      booking: { status: "pending" },
    });

    expect(resolution).toMatchObject({
      nextPaymentStatus: "failed",
      shouldUpdatePayment: true,
      shouldConfirmBooking: false,
    });
  });

  it("ignores failure event after success", () => {
    const resolution = resolvePaymentEvent({
      eventType: "payment.failed",
      payment: { status: "succeeded" },
      booking: { status: "confirmed" },
    });

    expect(resolution.alreadyProcessed).toBe(true);
    expect(resolution.shouldUpdatePayment).toBe(false);
  });
});
