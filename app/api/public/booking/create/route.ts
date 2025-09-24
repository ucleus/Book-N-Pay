import { addDays, isBefore } from "date-fns";
import { NextResponse, type NextRequest } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { createBookingSchema } from "@/lib/validation/booking";
import { filterSlotsByBookings, generateBookableSlots } from "@/lib/domain/availability";

interface BookingWindowRow {
  start_at: string;
  end_at: string;
  status: string;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = createBookingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const { providerHandle, serviceId, startAt, customer, notes } = parsed.data;

  let supabase;
  try {
    supabase = getServiceRoleClient();
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data: provider, error: providerError } = await supabase
    .from("providers")
    .select("id, currency, handle, display_name")
    .eq("handle", providerHandle)
    .maybeSingle();

  if (providerError) {
    console.error(providerError);
    return NextResponse.json({ error: "Unable to load provider" }, { status: 500 });
  }

  if (!provider) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404 });
  }

  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("id, provider_id, duration_min, base_price_cents, is_active, name")
    .eq("id", serviceId)
    .maybeSingle();

  if (serviceError) {
    console.error(serviceError);
    return NextResponse.json({ error: "Unable to load service" }, { status: 500 });
  }

  if (!service || service.provider_id !== provider.id || !service.is_active) {
    return NextResponse.json({ error: "Service not available" }, { status: 404 });
  }

  const startDate = new Date(startAt);

  if (Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ error: "Invalid start time" }, { status: 400 });
  }

  if (isBefore(startDate, new Date())) {
    return NextResponse.json({ error: "Selected time is in the past" }, { status: 409 });
  }

  const { data: rules, error: rulesError } = await supabase
    .from("availability_rules")
    .select("id, provider_id, dow, start_time, end_time")
    .eq("provider_id", provider.id);

  if (rulesError) {
    console.error(rulesError);
    return NextResponse.json({ error: "Unable to load availability" }, { status: 500 });
  }

  if (!rules || rules.length === 0) {
    return NextResponse.json({ error: "No availability configured" }, { status: 409 });
  }

  const { data: blackoutDates, error: blackoutError } = await supabase
    .from("blackout_dates")
    .select("id, provider_id, day, reason")
    .eq("provider_id", provider.id);

  if (blackoutError) {
    console.error(blackoutError);
    return NextResponse.json({ error: "Unable to load blackout dates" }, { status: 500 });
  }

  const dayStart = new Date(startDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = addDays(dayStart, 1);

  const baseSlots = generateBookableSlots({
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

  if (baseSlots.length === 0) {
    return NextResponse.json({ error: "Selected day has no availability" }, { status: 409 });
  }

  const { data: bookings, error: bookingsError } = await supabase
    .from("bookings")
    .select("start_at, end_at, status")
    .eq("provider_id", provider.id)
    .eq("service_id", service.id)
    .in("status", ["pending", "confirmed"])
    .gte("start_at", dayStart.toISOString())
    .lt("start_at", dayEnd.toISOString());

  if (bookingsError) {
    console.error(bookingsError);
    return NextResponse.json({ error: "Unable to load bookings" }, { status: 500 });
  }

  const availableSlots = filterSlotsByBookings({
    slots: baseSlots,
    bookings:
      (bookings as BookingWindowRow[] | null)?.map((booking) => ({
        startAt: booking.start_at,
        endAt: booking.end_at,
        status: booking.status as "pending" | "confirmed",
      })) ?? [],
  });

  const requestedSlot = availableSlots.find((slot) => slot.start === startDate.toISOString());

  if (!requestedSlot) {
    return NextResponse.json({ error: "Slot no longer available" }, { status: 409 });
  }

  const endDate = new Date(requestedSlot.end);

  const { data: customerRow, error: customerError } = await supabase
    .from("customers")
    .upsert(
      {
        email: customer.email,
        name: customer.name,
        phone: customer.phone,
      },
      { onConflict: "email" },
    )
    .select()
    .maybeSingle();

  if (customerError) {
    console.error(customerError);
    return NextResponse.json({ error: "Unable to save customer" }, { status: 500 });
  }

  if (!customerRow) {
    return NextResponse.json({ error: "Unable to save customer" }, { status: 500 });
  }

  const { data: booking, error: bookingError } = await supabase
    .from("bookings")
    .insert({
      provider_id: provider.id,
      service_id: service.id,
      customer_id: customerRow.id,
      start_at: requestedSlot.start,
      end_at: requestedSlot.end,
      status: "pending",
      notes: notes ?? null,
    })
    .select("id, start_at, end_at, status")
    .maybeSingle();

  if (bookingError) {
    console.error(bookingError);
    return NextResponse.json({ error: "Unable to create booking" }, { status: 500 });
  }

  if (!booking) {
    return NextResponse.json({ error: "Unable to create booking" }, { status: 500 });
  }

  const { error: notificationError } = await supabase.from("notifications").insert({
    booking_id: booking.id,
    channel: "email",
    recipient: customer.email,
    payload: {
      type: "booking_customer_pending",
      bookingId: booking.id,
      providerHandle: provider.handle,
      providerName: provider.display_name ?? provider.handle,
      serviceName: service.name,
      startAt: booking.start_at,
      customerName: customer.name,
    },
  });

  if (notificationError) {
    console.error(notificationError);
    return NextResponse.json({ error: "Failed to queue notification" }, { status: 500 });
  }

  return NextResponse.json({
    booking: {
      id: booking.id,
      startAt: booking.start_at,
      endAt: booking.end_at,
      status: booking.status,
    },
    message: "Booking received. We will confirm shortly via WhatsApp and email.",
  });
}
