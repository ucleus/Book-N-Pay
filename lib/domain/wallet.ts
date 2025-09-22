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
  message: string;
}

export interface PaymentIntentProvider {
  createPerBookingIntent(bookingId: string, amountCents: number): Promise<{ checkoutUrl: string }>;
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

export async function confirmBookingHappyPath(params: {
  wallet: Wallet;
  booking: Booking;
  paymentIntentProvider: PaymentIntentProvider;
  bookingAmountCents: number;
}): Promise<BookingConfirmationOutcome> {
  const { wallet, booking, paymentIntentProvider, bookingAmountCents } = params;

  if (wallet.balanceCredits < 1) {
    const paymentIntent = await paymentIntentProvider.createPerBookingIntent(
      booking.id,
      bookingAmountCents,
    );

    return {
      status: "requires_payment",
      checkoutUrl: paymentIntent.checkoutUrl,
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
