import { describe, expect, it, vi } from "vitest";
import { confirmBookingHappyPath, consumeCreditForBooking } from "@/lib/domain/wallet";
import type { Booking, Wallet } from "@/lib/domain/types";

const baseWallet: Wallet = {
  id: "wallet-1",
  providerId: "provider-1",
  balanceCredits: 2,
  currency: "JMD",
};

const baseBooking: Booking = {
  id: "booking-1",
  providerId: "provider-1",
  serviceId: "service-1",
  customerId: "customer-1",
  startAt: new Date().toISOString(),
  endAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
  status: "pending",
};

describe("consumeCreditForBooking", () => {
  it("deducts one credit and records ledger entry", () => {
    const { wallet, ledgerEntry } = consumeCreditForBooking(baseWallet, baseBooking, new Date("2024-01-01T00:00:00Z"));

    expect(wallet.balanceCredits).toBe(1);
    expect(ledgerEntry).toMatchObject({
      walletId: baseWallet.id,
      bookingId: baseBooking.id,
      changeCredits: -1,
      description: "Credit consumed for booking confirmation",
    });
  });

  it("throws when credits are insufficient", () => {
    expect(() => consumeCreditForBooking({ ...baseWallet, balanceCredits: 0 }, baseBooking)).toThrowError(
      "INSUFFICIENT_CREDITS",
    );
  });
});

describe("confirmBookingHappyPath", () => {
  it("consumes a credit when wallet has balance", async () => {
    const result = await confirmBookingHappyPath({
      wallet: baseWallet,
      booking: baseBooking,
      paymentIntentProvider: {
        createPerBookingIntent: vi.fn(),
      },
      bookingAmountCents: 5000,
    });

    expect(result.status).toBe("confirmed");
    expect(result.wallet?.balanceCredits).toBe(1);
    expect(result.ledgerEntry).toBeDefined();
  });

  it("requests payment intent when credits depleted", async () => {
    const paymentIntentProvider = {
      createPerBookingIntent: vi.fn().mockResolvedValue({ checkoutUrl: "https://mockpay.local/checkout" }),
    };

    const result = await confirmBookingHappyPath({
      wallet: { ...baseWallet, balanceCredits: 0 },
      booking: baseBooking,
      paymentIntentProvider,
      bookingAmountCents: 5000,
    });

    expect(result.status).toBe("requires_payment");
    expect(paymentIntentProvider.createPerBookingIntent).toHaveBeenCalledWith(baseBooking.id, 5000);
    expect(result.checkoutUrl).toBe("https://mockpay.local/checkout");
  });
});
