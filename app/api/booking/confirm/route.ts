import { NextResponse, type NextRequest } from "next/server";
import { addMinutes } from "date-fns";
import { getRouteHandlerClient, getServiceRoleClient } from "@/lib/supabase/server";
import { confirmBookingSchema } from "@/lib/validation/booking";
import { confirmBookingHappyPath } from "@/lib/domain/wallet";
import { MockPaymentGateway } from "@/lib/domain/payments";
import type { Database } from "@/types/database";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = confirmBookingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const { bookingId, providerId } = parsed.data;

  const authClient = getRouteHandlerClient();

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError) {
    console.error(authError);
    return NextResponse.json({ error: "AUTH_ERROR" }, { status: 500 });
  }

  if (!user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const { data: provider, error: providerLookupError } = await authClient
    .from("providers")
    .select("id, user_id, display_name")
    .select("id")
    .eq("id", providerId)
    .maybeSingle();

  if (providerLookupError) {
    console.error(providerLookupError);
    return NextResponse.json({ error: "PROVIDER_LOOKUP_FAILED" }, { status: 500 });
  }

  if (!provider) {
    return NextResponse.json({ error: "PROVIDER_NOT_FOUND" }, { status: 404 });
  }

  if (provider.user_id !== user.id) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  let supabase;
  try {
    supabase = getServiceRoleClient();
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data: providerUser, error: providerUserError } = await supabase
    .from("users")
    .select("email, phone")
    .eq("id", provider.user_id)
    .maybeSingle();

  if (providerUserError) {
    console.error(providerUserError);
    return NextResponse.json({ error: "Unable to load provider contact" }, { status: 500 });
  }

  if (!providerUser) {
    return NextResponse.json({ error: "Provider contact missing" }, { status: 500 });
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, provider_id, service_id, customer_id, start_at, end_at, status, pay_mode")
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

  const { data: customer, error: customerError } = await supabase
    .from("customers")
    .select("id, email, name, phone")
    .eq("id", booking.customer_id)
    .maybeSingle();

  if (customerError) {
    console.error(customerError);
    return NextResponse.json({ error: "Unable to load customer" }, { status: 500 });
  }

  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("id, base_price_cents, duration_min, name")
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

  const endAt = booking.end_at ?? addMinutes(new Date(booking.start_at), service.duration_min).toISOString();

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
      endAt,
      status: booking.status,
      payMode: booking.pay_mode as "credit" | "per_booking" | null,
    },
    paymentIntentProvider: new MockPaymentGateway(),
    bookingAmountCents: service.base_price_cents,
  });

  if (outcome.status === "requires_payment") {
    const paymentReference = outcome.paymentReference ?? `mockpay_${booking.id}`;

    const { data: existingPayment, error: existingPaymentError } = await supabase
      .from("payments")
      .select("id, status")
      .eq("gateway", "mockpay")
      .eq("gateway_ref", paymentReference)
      .maybeSingle();

    if (existingPaymentError) {
      console.error(existingPaymentError);
      return NextResponse.json({ error: "Unable to prepare payment" }, { status: 500 });
    }

    if (!existingPayment) {
      const { error: paymentInsertError } = await supabase.from("payments").insert({
        booking_id: booking.id,
        provider_id: providerId,
        status: "initiated",
        amount_cents: service.base_price_cents,
        gateway: "mockpay",
        gateway_ref: paymentReference,
        metadata: {
          strategy: "per_booking",
          checkoutUrl: outcome.checkoutUrl,
        },
      });

      if (paymentInsertError) {
        console.error(paymentInsertError);
        return NextResponse.json({ error: "Unable to create payment" }, { status: 500 });
      }
    } else if (existingPayment.status === "initiated") {
      const { error: paymentUpdateError } = await supabase
        .from("payments")
        .update({
          amount_cents: service.base_price_cents,
          metadata: {
            strategy: "per_booking",
            checkoutUrl: outcome.checkoutUrl,
          },
        })
        .eq("id", existingPayment.id);

      if (paymentUpdateError) {
        console.error(paymentUpdateError);
        return NextResponse.json({ error: "Unable to refresh payment" }, { status: 500 });
      }
    }

    if (booking.pay_mode !== "per_booking") {
      const { error: bookingUpdateError } = await supabase
        .from("bookings")
        .update({ pay_mode: "per_booking", updated_at: new Date().toISOString() })
        .eq("id", booking.id);

      if (bookingUpdateError) {
        console.error(bookingUpdateError);
        return NextResponse.json({ error: "Unable to flag booking for payment" }, { status: 500 });
      }
    }

    return NextResponse.json({
      status: "requires_payment",
      checkoutUrl: outcome.checkoutUrl,
      paymentReference,
      message: outcome.message,
    });
  }

  if (!outcome.wallet || !outcome.ledgerEntry) {
    console.error("Wallet confirmation outcome missing wallet or ledger entry");
    return NextResponse.json({ error: "Failed to confirm booking" }, { status: 500 });
  }

  const updateWallet = supabase
    .from("wallets"
    .update({ balance_credits: outcome.wallet.balanceCredits })
    .eq("id", wallet.id);

  const insertLedger = supabase.from("wallet_ledger").insert({
    wallet_id: wallet.id,
    booking_id: booking.id,
    change_credits: outcome.ledgerEntry.changeCredits,
    description: outcome.ledgerEntry.description,
  });

  const updateBooking = supabase
    .from("bookings")
    .update({ status: "confirmed", pay_mode: "credit", updated_at: new 
    .update({ status: "confirmed", updated_at: new Date().toISOString() })
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

  const notifications: Database["public"]["Tables"]["notifications"]["Insert"][] = [];

  if (customer?.email) {
    notifications.push({
      booking_id: booking.id,
      channel: "email",
      recipient: customer.email,
      payload: {
        type: "booking_customer_confirmed",
        bookingId: booking.id,
        providerName: provider.display_name,
        serviceName: service.name,
        startAt: booking.start_at,
        customerName: customer.name ?? undefined,
      },
    });
  }

  if (customer?.phone) {
    notifications.push({
      booking_id: booking.id,
      channel: "whatsapp",
      recipient: customer.phone,
      payload: {
        type: "booking_customer_confirmed",
        bookingId: booking.id,
        providerName: provider.display_name,
        serviceName: service.name,
        startAt: booking.start_at,
        customerName: customer.name ?? undefined,
      },
    });
  }

  const creditsRemaining = outcome.wallet.balanceCredits;

  if (creditsRemaining <= 2 && providerUser) {
    if (providerUser.email) {
      notifications.push({
        booking_id: booking.id,
        channel: "email",
        recipient: providerUser.email,
        payload: {
          type: "provider_low_credits_warning",
          providerName: provider.display_name,
          creditsRemaining,
        },
      });
    }

    if (providerUser.phone) {
      notifications.push({
        booking_id: booking.id,
        channel: "whatsapp",
        recipient: providerUser.phone,
        payload: {
          type: "provider_low_credits_warning",
          providerName: provider.display_name,
          creditsRemaining,
        },
      });
    }
  }

  if (notifications.length > 0) {
    const { error: notificationError } = await supabase.from("notifications").insert(notifications);

    if (notificationError) {
      console.error(notificationError);
      return NextResponse.json({ error: "Failed to queue notifications" }, { status: 500 });
    }
  }

  return NextResponse.json({
    status: "confirmed",
    message: outcome.message,
  });
}
