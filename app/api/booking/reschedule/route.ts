import { addDays, isBefore, startOfDay } from "date-fns";
import { NextResponse, type NextRequest } from "next/server";
import { getRouteHandlerClient, getServiceRoleClient } from "@/lib/supabase/server";
import { rescheduleBookingSchema } from "@/lib/validation/booking";
import { filterSlotsByBookings, generateBookableSlots } from "@/lib/domain/availability";
import type { Database } from "@/types/database";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = rescheduleBookingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const { bookingId, providerId, newStartAt, chargeCustomerFee, note } = parsed.data;
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

  // Fixed: Removed duplicate .select() and kept all needed fields
  const { data: provider, error: providerError } = await authClient
    .from("providers")
    .select("id, reschedule_fee_cents, currency, display_name")
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
    .select("id, provider_id, service_id, customer_id, status, start_at, end_at, notes")
    .eq("id", bookingId)
    .maybeSingle();

  if (bookingError) {
    console.error(bookingError);
    return NextResponse.json({ error: "Unable to load booking" }, { status: 500 });
  }

  if (!booking || booking.provider_id !== providerId) {
    return NextResponse.json({ error: "BOOKING_NOT_FOUND" }, { status: 404 });
  }

  if (!["pending", "confirmed"].includes(booking.status)) {
    return NextResponse.json({ error: "UNSUPPORTED_STATUS" }, { status: 409 });
  }

  const nextStart = new Date(newStartAt);
  if (Number.isNaN(nextStart.getTime())) {
    return NextResponse.json({ error: "INVALID_START" }, { status: 400 });
  }

  if (isBefore(nextStart, new Date())) {
    return NextResponse.json({ error: "START_IN_PAST" }, { status: 409 });
  }

  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("id, provider_id, duration_min, name")
    .eq("id", booking.service_id)
    .maybeSingle();

  if (serviceError) {
    console.error(serviceError);
    return NextResponse.json({ error: "Unable to load service" }, { status: 500 });
  }

  if (!service || service.provider_id !== providerId) {
    return NextResponse.json({ error: "SERVICE_NOT_FOUND" }, { status: 404 });
  }

  const dayStart = startOfDay(nextStart);
  const dayEnd = addDays(dayStart, 1);

  const { data: rules, error: rulesError } = await supabase
    .from("availability_rules")
    .select("id, provider_id, dow, start_time, end_time")
    .eq("provider_id", providerId);

  if (rulesError) {
    console.error(rulesError);
    return NextResponse.json({ error: "Unable to load availability" }, { status: 500 });
  }

  if (!rules || rules.length === 0) {
    return NextResponse.json({ error: "NO_AVAILABILITY" }, { status: 409 });
  }

  const { data: blackoutDates, error: blackoutError } = await supabase
    .from("blackout_dates")
    .select("id, provider_id, day, reason")
    .eq("provider_id", providerId);

  if (blackoutError) {
    console.error(blackoutError);
    return NextResponse.json({ error: "Unable to load blackout dates" }, { status: 500 });
  }

  const slots = generateBookableSlots({
    rules: rules.map((rule) => ({
      id: rule.id,
      providerId: rule.provider_id,
      dow: rule.dow,
      startTime: rule.start_time,
      endTime: rule.end_time,
    })),
    blackoutDates: (blackoutDates ?? []).map((entry) => ({
      id: entry.id,
      providerId: entry.provider_id,
      day: entry.day,
      reason: entry.reason,
    })),
    serviceDurationMin: service.duration_min,
    from: dayStart.toISOString(),
    days: 1,
  });

  if (slots.length === 0) {
    return NextResponse.json({ error: "NO_SLOTS" }, { status: 409 });
  }

  const { data: dayBookings, error: dayBookingError } = await supabase
    .from("bookings")
    .select("id, start_at, end_at, status")
    .eq("provider_id", providerId)
    .eq("service_id", service.id)
    .in("status", ["pending", "confirmed"])
    .neq("id", booking.id)
    .gte("start_at", dayStart.toISOString())
    .lt("start_at", dayEnd.toISOString());

  if (dayBookingError) {
    console.error(dayBookingError);
    return NextResponse.json({ error: "Unable to load conflicting bookings" }, { status: 500 });
  }

  const availableSlots = filterSlotsByBookings({
    slots,
    bookings:
      (dayBookings ?? []).map((existing) => ({
        startAt: existing.start_at,
        endAt: existing.end_at ?? existing.start_at,
        status: existing.status as "pending" | "confirmed",
      })) ?? [],
  });

  const requestedSlot = availableSlots.find((slot) => slot.start === nextStart.toISOString());

  if (!requestedSlot) {
    return NextResponse.json({ error: "SLOT_UNAVAILABLE" }, { status: 409 });
  }

  const now = new Date();
  const updatePayload: { start_at: string; end_at: string; updated_at: string; notes?: string | null } = {
    start_at: requestedSlot.start,
    end_at: requestedSlot.end,
    updated_at: now.toISOString(),
  };

  if (note) {
    const combinedNotes = [booking.notes, `Reschedule note: ${note}`]
      .filter((segment): segment is string => Boolean(segment))
      .join("\n\n");
    updatePayload.notes = combinedNotes;
  }

  const { error: updateError } = await supabase
    .from("bookings")
    .update(updatePayload)
    .eq("id", booking.id);

  if (updateError) {
    console.error(updateError);
    return NextResponse.json({ error: "Failed to reschedule booking" }, { status: 500 });
  }

  let feeCharged = false;
  if (chargeCustomerFee && (provider.reschedule_fee_cents ?? 0) > 0) {
    const { error: feeError } = await supabase.from("payments").insert({
      booking_id: booking.id,
      provider_id: providerId,
      status: "succeeded",
      amount_cents: provider.reschedule_fee_cents,
      gateway: "manual",
      gateway_ref: `manual_reschedule_${booking.id}_${Date.now()}`,
      metadata: {
        type: "reschedule_fee",
        chargedAt: now.toISOString(),
        currency: provider.currency,
      },
    });

    if (feeError) {
      console.error(feeError);
      return NextResponse.json({ error: "Failed to record reschedule fee" }, { status: 500 });
    }

    feeCharged = true;
  }

  if (booking.customer_id) {
    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("email, name, phone")
      .eq("id", booking.customer_id)
      .maybeSingle();

    if (customerError) {
      console.error(customerError);
      return NextResponse.json({ error: "Unable to load customer" }, { status: 500 });
    }

    const notifications: Database["public"]["Tables"]["notifications"]["Insert"][] = [];

    const payload = {
      type: "booking_customer_rescheduled" as const,
      previousStartAt: booking.start_at,
      newStartAt: requestedSlot.start,
      feeCharged,
      providerName: provider.display_name,
      serviceName: service.name,
      customerName: customer?.name ?? undefined,
    };

    if (customer?.email) {
      notifications.push({
        booking_id: booking.id,
        channel: "email",
        recipient: customer.email,
        payload,
      });
    }

    if (customer?.phone) {
      notifications.push({
        booking_id: booking.id,
        channel: "whatsapp",
        recipient: customer.phone,
        payload,
      });
    }

    if (notifications.length > 0) {
      const { error: notificationError } = await supabase.from("notifications").insert(notifications);

      if (notificationError) {
        console.error(notificationError);
        return NextResponse.json({ error: "Failed to queue reschedule notice" }, { status: 500 });
      }
    }
  }

  return NextResponse.json({
    status: booking.status,
    startAt: requestedSlot.start,
    endAt: requestedSlot.end,
    feeCharged,
  });
}