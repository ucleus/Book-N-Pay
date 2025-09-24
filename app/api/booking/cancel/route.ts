import { NextResponse, type NextRequest } from "next/server";
import { getRouteHandlerClient, getServiceRoleClient } from "@/lib/supabase/server";
import { cancelBookingSchema } from "@/lib/validation/booking";
import { evaluateCancellationPolicy } from "@/lib/domain/booking-policy";
import { refundCreditForCancellation } from "@/lib/domain/wallet";
import type { Booking } from "@/lib/domain/types";
import type { Database } from "@/types/database";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = cancelBookingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const { bookingId, providerId, reason, cancelledBy } = parsed.data;
  const actor = cancelledBy ?? "provider";

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

  const { data: provider, error: providerError } = await authClient
    .from("providers")
    .select("id, late_cancel_hours, display_name")
    .select("id, late_cancel_hours")
    .eq("id", providerId)
    .maybeSingle();

  if (providerError) {
    console.error(providerError);
    return NextResponse.json({ error: "PROVIDER_LOOKUP_FAILED" }, { status: 500 });
  }

  if (!provider) {
    return NextResponse.json({ error: "PROVIDER_NOT_FOUND" }, { status: 404 });
  }

  let supabase;
  try {
    supabase = getServiceRoleClient();
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .select("id, provider_id, service_id, customer_id, status, pay_mode, start_at, end_at, notes")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) {
    console.error(bookingError);
    return NextResponse.json({ error: "Unable to load booking" }, { status: 500 });
  }

  if (!booking || booking.provider_id !== providerId) {
    return NextResponse.json({ error: "BOOKING_NOT_FOUND" }, { status: 404 });
  }

  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("id, name")
    .eq("id", booking.service_id)
    .maybeSingle();

  if (serviceError) {
    console.error(serviceError);
    return NextResponse.json({ error: "Unable to load service" }, { status: 500 });
  }

  if (!["pending", "confirmed"].includes(booking.status)) {
    return NextResponse.json({ error: "UNSUPPORTED_STATUS" }, { status: 409 });
  }

  const now = new Date();
  const policy = evaluateCancellationPolicy({
    bookingStartAt: booking.start_at,
    lateCancelHours: provider.late_cancel_hours ?? 0,
    now,
  });

  let refundIssued = false;

  if (booking.status === "confirmed" && booking.pay_mode === "credit" && policy.refundEligible) {
    const { data: wallet, error: walletError } = await supabase
      .from("wallets")
      .select("id, provider_id, balance_credits, currency")
      .eq("provider_id", providerId)
      .maybeSingle();

    if (walletError) {
      console.error(walletError);
      return NextResponse.json({ error: "Wallet lookup failed" }, { status: 500 });
    }

    if (!wallet) {
      return NextResponse.json({ error: "Wallet missing" }, { status: 400 });
    }

    const bookingDomain: Booking = {
      id: booking.id,
      providerId: booking.provider_id,
      serviceId: booking.service_id,
      customerId: booking.customer_id,
      startAt: booking.start_at,
      endAt: booking.end_at ?? booking.start_at,
      status: booking.status as Booking["status"],
      payMode: booking.pay_mode as Booking["payMode"],
    };

    const { wallet: updatedWallet, ledgerEntry } = refundCreditForCancellation(
      {
        id: wallet.id,
        providerId: wallet.provider_id,
        balanceCredits: wallet.balance_credits,
        currency: wallet.currency,
      },
      bookingDomain,
      now,
    );

    const { error: walletUpdateError } = await supabase
      .from("wallets")
      .update({ balance_credits: updatedWallet.balanceCredits })
      .eq("id", wallet.id);

    if (walletUpdateError) {
      console.error(walletUpdateError);
      return NextResponse.json({ error: "Failed to refund wallet" }, { status: 500 });
    }

    const { error: ledgerError } = await supabase.from("wallet_ledger").insert({
      wallet_id: wallet.id,
      booking_id: booking.id,
      change_credits: ledgerEntry.changeCredits,
      description: ledgerEntry.description,
    });

    if (ledgerError) {
      console.error(ledgerError);
      return NextResponse.json({ error: "Failed to record refund" }, { status: 500 });
    }

    refundIssued = true;
  } else if (booking.status === "confirmed" && booking.pay_mode === "per_booking" && policy.refundEligible) {
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .select("id, status, metadata")
      .eq("booking_id", booking.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentError) {
      console.error(paymentError);
      return NextResponse.json({ error: "Payment lookup failed" }, { status: 500 });
    }

    if (payment && payment.status !== "refunded") {
      const metadata =
        payment.metadata && typeof payment.metadata === "object" && !Array.isArray(payment.metadata)
          ? { ...payment.metadata }
          : {};

      metadata.refundReason = `cancelled_by_${actor}`;
      metadata.refundedAt = now.toISOString();

      const { error: refundError } = await supabase
        .from("payments")
        .update({ status: "refunded", metadata })
        .eq("id", payment.id);

      if (refundError) {
        console.error(refundError);
        return NextResponse.json({ error: "Failed to update payment" }, { status: 500 });
      }

      refundIssued = true;
    }
  }

  const updatePayload: { status: "cancelled"; updated_at: string; notes?: string | null } = {
    status: "cancelled",
    updated_at: now.toISOString(),
  };

  if (reason) {
    const noteSegments = [booking.notes, `Cancellation note (${actor}): ${reason}`].filter((segment): segment is string =>
      Boolean(segment),
    );
    updatePayload.notes = noteSegments.join("\n\n");
  }

  const { error: updateBookingError } = await supabase
    .from("bookings")
    .update(updatePayload)
    .eq("id", booking.id);

  if (updateBookingError) {
    console.error(updateBookingError);
    return NextResponse.json({ error: "Failed to cancel booking" }, { status: 500 });
  }

  if (booking.customer_id) {
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("email, name, phone")
      .select("email, name")
      .eq("id", booking.customer_id)
      .maybeSingle();

    if (customerError) {
      console.error(customerError);
      return NextResponse.json({ error: "Unable to load customer" }, { status: 500 });
    }

    const notifications: Database["public"]["Tables"]["notifications"]["Insert"][] = [];

    if (customer?.email) {
      notifications.push({
    if (customer?.email) {
      const { error: notificationError } = await supabase.from("notifications").insert({
        booking_id: booking.id,
        channel: "email",
        recipient: customer.email,
        payload: {
          type: "booking_customer_cancelled",
          cancelledBy: actor,
          startAt: booking.start_at,
          refundIssued,
          providerName: provider.display_name,
          serviceName: service?.name ?? "your booking",
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
          type: "booking_customer_cancelled",
          cancelledBy: actor,
          startAt: booking.start_at,
          refundIssued,
          providerName: provider.display_name,
          serviceName: service?.name ?? "your booking",
          customerName: customer.name ?? undefined,
        },
      });
    }

    if (notifications.length > 0) {
      const { error: notificationError } = await supabase.from("notifications").insert(notifications);
        },
      });

      if (notificationError) {
        console.error(notificationError);
        return NextResponse.json({ error: "Failed to queue cancellation notice" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({
    status: "cancelled",
    refundIssued,
    lateCancellation: policy.isLate,
  });
}
