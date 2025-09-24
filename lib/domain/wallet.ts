import { randomUUID } from "crypto";
import type { Booking, Wallet, WalletLedgerEntry } from "./types";

export interface CreditConsumptionResult {
  wallet: Wallet;
  ledgerEntry: WalletLedgerEntry;
}

export interface BookingConfirmationOutcome {
  status: "confirmed" | "requires_payment";
  wallet?: Wallet;
  ledgerEntry?: WalletLedgerEntry;
  checkoutUrl?: string;
  paymentReference?: string;
  message: string;
}

export interface CreditTopupOutcome {
  wallet: Wallet;
  ledgerEntry: WalletLedgerEntry;
}

export interface CreditRefundOutcome {
  wallet: Wallet;
  ledgerEntry: WalletLedgerEntry;
}

export interface PaymentIntentProvider {
  createPerBookingIntent(
    bookingId: string,
    amountCents: number,
  ): Promise<{ checkoutUrl: string; reference: string }>;
}

export function addCreditsToWallet(wallet: Wallet, credits: number, now: Date = new Date()): CreditTopupOutcome {
  if (!Number.isInteger(credits) || credits <= 0) {
    throw new Error("INVALID_TOPUP_CREDITS");
  }

  const updatedWallet: Wallet = {
    ...wallet,
    balanceCredits: wallet.balanceCredits + credits,
  };

  const ledgerEntry: WalletLedgerEntry = {
    id: randomUUID(),
    walletId: wallet.id,
    bookingId: undefined,
    changeCredits: credits,
    description: credits === 1 ? "Top up 1 credit" : `Top up ${credits} credits`,
    createdAt: now.toISOString(),
  };

  return { wallet: updatedWallet, ledgerEntry };
}

export function consumeCreditForBooking(wallet: Wallet, booking: Booking, now: Date = new Date()): CreditConsumptionResult {
  if (wallet.balanceCredits < 1) {
    throw new Error("INSUFFICIENT_CREDITS");
  }

  const updatedWallet: Wallet = {
    ...wallet,
    balanceCredits: wallet.balanceCredits - 1,
  };

  const ledgerEntry: WalletLedgerEntry = {
    id: randomUUID(),
    walletId: wallet.id,
    bookingId: booking.id,
    changeCredits: -1,
    description: "Credit consumed for booking confirmation",
    createdAt: now.toISOString(),
  };

  return { wallet: updatedWallet, ledgerEntry };
}

export function refundCreditForCancellation(
  wallet: Wallet,
  booking: Booking,
  now: Date = new Date(),
): CreditRefundOutcome {
  const updatedWallet: Wallet = {
    ...wallet,
    balanceCredits: wallet.balanceCredits + 1,
  };

  const ledgerEntry: WalletLedgerEntry = {
    id: randomUUID(),
    walletId: wallet.id,
    bookingId: booking.id,
    changeCredits: 1,
    description: "Credit refunded after cancellation",
    createdAt: now.toISOString(),
  };

  return { wallet: updatedWallet, ledgerEntry };
}

export async function confirmBookingHappyPath(params: {
  wallet: Wallet;
  booking: Booking;
  paymentIntentProvider: PaymentIntentProvider;
  bookingAmountCents: number;
}): Promise<BookingConfirmationOutcome> {
  const { wallet, booking, paymentIntentProvider, bookingAmountCents } = params;

  if (wallet.balanceCredits < 1) {
    const paymentIntent = await paymentIntentProvider.createPerBookingIntent(booking.id, bookingAmountCents);

    return {
      status: "requires_payment",
      checkoutUrl: paymentIntent.checkoutUrl,
      paymentReference: paymentIntent.reference,
      message: "No credits remaining. Provider must complete checkout to confirm booking.",
    };
  }

  const { wallet: updatedWallet, ledgerEntry } = consumeCreditForBooking(wallet, booking);
  return {
    status: "confirmed",
    wallet: updatedWallet,
    ledgerEntry,
    message: "Booking confirmed and credit deducted.",
  };
}
