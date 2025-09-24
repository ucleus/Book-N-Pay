import { addDays } from "date-fns";
import { NextResponse, type NextRequest } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { checkAvailabilitySchema } from "@/lib/validation/booking";
import { filterSlotsByBookings, generateBookableSlots } from "@/lib/domain/availability";
import type { BookingStatus } from "@/lib/domain/types";

interface BookingRow {
  start_at: string;
  end_at: string;
  status: string;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = checkAvailabilitySchema.safeParse(body);

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

  const { providerHandle, serviceId, date } = parsed.data;

  const { data: provider, error: providerError } = await supabase
    .from("providers")
    .select("id, handle")
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
    .select("id, provider_id, duration_min, is_active")
    .eq("id", serviceId)
    .maybeSingle();

  if (serviceError) {
    console.error(serviceError);
    return NextResponse.json({ error: "Unable to load service" }, { status: 500 });
  }

  if (!service || service.provider_id !== provider.id || !service.is_active) {
    return NextResponse.json({ error: "Service not available" }, { status: 404 });
  }

  const { data: rules, error: rulesError } = await supabase
    .from("availability_rules")
    .select("id, provider_id, dow, start_time, end_time")
    .eq("provider_id", provider.id);

  if (rulesError) {
    console.error(rulesError);
    return NextResponse.json({ error: "Unable to load availability" }, { status: 500 });
  }

  const { data: blackoutDates, error: blackoutError } = await supabase
    .from("blackout_dates")
    .select("id, provider_id, day, reason")
    .eq("provider_id", provider.id)
    .gte("day", date)
    .lte("day", date);

  if (blackoutError) {
    console.error(blackoutError);
    return NextResponse.json({ error: "Unable to load blackout dates" }, { status: 500 });
  }

  if (!rules || rules.length === 0) {
    return NextResponse.json({ slots: [] });
  }

  const dayStart = new Date(`${date}T00:00:00.000Z`);
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
  }).filter((slot) => slot.start.startsWith(date));

  if (baseSlots.length === 0) {
    return NextResponse.json({ slots: [] });
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
    bookings: (bookings as BookingRow[] | null)?.map((booking) => ({
      startAt: booking.start_at,
      endAt: booking.end_at,
      status: booking.status as BookingStatus,
    })) ?? [],
  });

  return NextResponse.json({ slots: availableSlots });
}
