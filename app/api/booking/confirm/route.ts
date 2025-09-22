import { NextResponse, type NextRequest } from "next/server";
import { addMinutes } from "date-fns";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { confirmBookingSchema } from "@/lib/validation/booking";
import { confirmBookingHappyPath } from "@/lib/domain/wallet";
import { MockPaymentGateway } from "@/lib/domain/payments";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = confirmBookingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  let supabase;
  try {
    supabase = getServiceRoleClient();
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { bookingId, providerId } = parsed.data;

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, provider_id, service_id, customer_id, start_at, end_at, status")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) {
    console.error(bookingError);
    return NextResponse.json({ error: "Unable to load booking" }, { status: 500 });
  }

  if (!booking || booking.provider_id !== providerId) {
    return NextResponse.json({ error: "Booking not found" }, { status: 404 });
  }

  if (booking.status === "confirmed") {
    return NextResponse.json({ message: "Booking already confirmed" });
  }

  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("id, base_price_cents, duration_min")
    .eq("id", booking.service_id)
    .maybeSingle();

  if (serviceError || !service) {
    console.error(serviceError);
    return NextResponse.json({ error: "Service unavailable" }, { status: 500 });
  }

  const { data: wallet, error: walletError } = await supabase
    .from("wallets")
    .select("id, provider_id, balance_credits, currency")
    .eq("provider_id", providerId)
    .maybeSingle();

  if (walletError) {
    console.error(walletError);
    return NextResponse.json({ error: "Wallet unavailable" }, { status: 500 });
  }

  if (!wallet) {
    return NextResponse.json({ error: "Wallet not provisioned" }, { status: 400 });
  }

  const outcome = await confirmBookingHappyPath({
    wallet: {
      id: wallet.id,
      providerId: wallet.provider_id,
      balanceCredits: wallet.balance_credits,
      currency: wallet.currency,
    },
    booking: {
      id: booking.id,
      providerId: booking.provider_id,
      serviceId: booking.service_id,
      customerId: booking.customer_id,
      startAt: booking.start_at,
      endAt: booking.end_at ?? addMinutes(new Date(booking.start_at), service.duration_min).toISOString(),
      status: booking.status,
    },
    paymentIntentProvider: new MockPaymentGateway(),
    bookingAmountCents: service.base_price_cents,
  });

  if (outcome.status === "requires_payment") {
    return NextResponse.json({
      status: "requires_payment",
      checkoutUrl: outcome.checkoutUrl,
      message: outcome.message,
    });
  }

  const updateWallet = supabase
    .from("wallets")
    .update({ balance_credits: outcome.wallet?.balanceCredits })
    .eq("id", wallet.id);

  const insertLedger = supabase
    .from("wallet_ledger")
    .insert({
      wallet_id: wallet.id,
      booking_id: booking.id,
      change_credits: outcome.ledgerEntry?.changeCredits,
      description: outcome.ledgerEntry?.description,
    });

  const updateBooking = supabase
    .from("bookings")
    .update({ status: "confirmed" })
    .eq("id", booking.id);

  const [walletResult, ledgerResult, bookingResult] = await Promise.all([
    updateWallet,
    insertLedger,
    updateBooking,
  ]);

  if (walletResult.error || ledgerResult.error || bookingResult.error) {
    console.error(walletResult.error || ledgerResult.error || bookingResult.error);
    return NextResponse.json({ error: "Failed to persist confirmation" }, { status: 500 });
  }

  return NextResponse.json({
    status: "confirmed",
    message: outcome.message,
  });
}
