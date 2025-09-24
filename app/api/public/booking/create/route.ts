import { addDays, isBefore } from "date-fns";
import { NextResponse, type NextRequest } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { createBookingSchema } from "@/lib/validation/booking";
import { filterSlotsByBookings, generateBookableSlots } from "@/lib/domain/availability";
import type { Database } from "@/types/database";
import { applyRateLimit } from "@/lib/server/rate-limit";
import { sanitizeHandle, sanitizePlainText, sanitizePhone } from "@/lib/utils/sanitize";
import { getRequestIp } from "@/lib/utils/request";

const CREATE_RATE_LIMIT_WINDOW_MS = 5 * 60_000;
const CREATE_RATE_LIMIT_LIMIT = 5;

interface BookingWindowRow {
  start_at: string;
  end_at: string;
  status: string;
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = createBookingSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      {
        status: 400,
        headers: {
          "X-RateLimit-Limit": `${CREATE_RATE_LIMIT_LIMIT}`,
          "X-RateLimit-Remaining": `${CREATE_RATE_LIMIT_LIMIT}`,
          "X-RateLimit-Window": `${Math.ceil(CREATE_RATE_LIMIT_WINDOW_MS / 1000)}`,
        },
      },
    );
  }

  const { providerHandle, serviceId, startAt, customer, notes } = parsed.data;
  const sanitizedHandle = sanitizeHandle(providerHandle);

  if (sanitizedHandle !== providerHandle) {
    return NextResponse.json(
      { error: "Invalid provider handle" },
      {
        status: 400,
        headers: {
          "X-RateLimit-Limit": `${CREATE_RATE_LIMIT_LIMIT}`,
          "X-RateLimit-Remaining": `${CREATE_RATE_LIMIT_LIMIT}`,
          "X-RateLimit-Window": `${Math.ceil(CREATE_RATE_LIMIT_WINDOW_MS / 1000)}`,
        },
      },
    );
  }

  const ipAddress = getRequestIp(request);
  const rateResult = applyRateLimit({
    key: `public:booking-create:${sanitizedHandle}:${ipAddress}`,
    limit: CREATE_RATE_LIMIT_LIMIT,
    windowMs: CREATE_RATE_LIMIT_WINDOW_MS,
  });

  const baseHeaders: Record<string, string> = {
    "X-RateLimit-Limit": `${CREATE_RATE_LIMIT_LIMIT}`,
    "X-RateLimit-Window": `${Math.ceil(CREATE_RATE_LIMIT_WINDOW_MS / 1000)}`,
  };

  if (!rateResult.allowed) {
    return NextResponse.json(
      { error: "Too many booking attempts" },
      {
        status: 429,
        headers: {
          ...baseHeaders,
          "Retry-After": `${Math.ceil(rateResult.retryAfterMs / 1000)}`,
          "X-RateLimit-Remaining": "0",
        },
      },
    );
  }

  let supabase;
  try {
    supabase = getServiceRoleClient();
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500, headers: { ...baseHeaders, "X-RateLimit-Remaining": `${rateResult.remaining}` } },
    );
  }

  const successHeaders = {
    ...baseHeaders,
    "X-RateLimit-Remaining": `${rateResult.remaining}`,
  } satisfies Record<string, string>;

  const sanitizedCustomerName = sanitizePlainText(customer.name);
  if (sanitizedCustomerName.length < 2) {
    return NextResponse.json(
      { error: "Customer name is required" },
      { status: 400, headers: successHeaders },
    );
  }

  const normalizedCustomerEmail = customer.email.trim().toLowerCase();
  const sanitizedCustomerPhone = sanitizePhone(customer.phone);
  if (sanitizedCustomerPhone.length < 7) {
    return NextResponse.json(
      { error: "Phone number is invalid" },
      { status: 400, headers: successHeaders },
    );
  }

  const sanitizedNotes =
    typeof notes === "string" ? sanitizePlainText(notes).slice(0, 500) : undefined;

  const { data: provider, error: providerError } = await supabase
    .from("providers")
    .select("id, currency, handle, display_name")
    .eq("handle", sanitizedHandle)
    .maybeSingle();

  if (providerError) {
    console.error(providerError);
    return NextResponse.json({ error: "Unable to load provider" }, { status: 500, headers: successHeaders });
  }

  if (!provider) {
    return NextResponse.json({ error: "Provider not found" }, { status: 404, headers: successHeaders });
  }

  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("id, provider_id, duration_min, base_price_cents, is_active, name")
    .eq("id", serviceId)
    .maybeSingle();

  if (serviceError) {
    console.error(serviceError);
    return NextResponse.json({ error: "Unable to load service" }, { status: 500, headers: successHeaders });
  }

  if (!service || service.provider_id !== provider.id || !service.is_active) {
    return NextResponse.json({ error: "Service not available" }, { status: 404, headers: successHeaders });
  }

  const startDate = new Date(startAt);

  if (Number.isNaN(startDate.getTime())) {
    return NextResponse.json({ error: "Invalid start time" }, { status: 400, headers: successHeaders });
  }

  if (isBefore(startDate, new Date())) {
    return NextResponse.json({ error: "Selected time is in the past" }, { status: 409, headers: successHeaders });
  }

  const { data: rules, error: rulesError } = await supabase
    .from("availability_rules")
    .select("id, provider_id, dow, start_time, end_time")
    .eq("provider_id", provider.id);

  if (rulesError) {
    console.error(rulesError);
    return NextResponse.json({ error: "Unable to load availability" }, { status: 500, headers: successHeaders });
  }

  if (!rules || rules.length === 0) {
    return NextResponse.json({ error: "No availability configured" }, { status: 409, headers: successHeaders });
  }

  const { data: blackoutDates, error: blackoutError } = await supabase
    .from("blackout_dates")
    .select("id, provider_id, day, reason")
    .eq("provider_id", provider.id);

  if (blackoutError) {
    console.error(blackoutError);
    return NextResponse.json({ error: "Unable to load blackout dates" }, { status: 500, headers: successHeaders });
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
    return NextResponse.json({ error: "Selected day has no availability" }, { status: 409, headers: successHeaders });
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
    return NextResponse.json({ error: "Unable to load bookings" }, { status: 500, headers: successHeaders });
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
    return NextResponse.json({ error: "Slot no longer available" }, { status: 409, headers: successHeaders });
  }

  const endDate = new Date(requestedSlot.end);

  const { data: customerRow, error: customerError } = await supabase
    .from("customers")
    .upsert(
      {
        email: normalizedCustomerEmail,
        name: sanitizedCustomerName,
        phone: sanitizedCustomerPhone,
      },
      { onConflict: "email" },
    )
    .select()
    .maybeSingle();

  if (customerError) {
    console.error(customerError);
    return NextResponse.json({ error: "Unable to save customer" }, { status: 500, headers: successHeaders });
  }

  if (!customerRow) {
    return NextResponse.json({ error: "Unable to save customer" }, { status: 500, headers: successHeaders });
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
      notes: sanitizedNotes && sanitizedNotes.length > 0 ? sanitizedNotes : null,
    })
    .select("id, start_at, end_at, status")
    .maybeSingle();

  if (bookingError) {
    console.error(bookingError);
    return NextResponse.json({ error: "Unable to create booking" }, { status: 500, headers: successHeaders });
  }

  if (!booking) {
    return NextResponse.json({ error: "Unable to create booking" }, { status: 500, headers: successHeaders });
  }

  const notifications: Database["public"]["Tables"]["notifications"]["Insert"][] = [
    {
      booking_id: booking.id,
      channel: "email" as const,
      recipient: normalizedCustomerEmail,
      payload: {
        type: "booking_customer_pending" as const,
        bookingId: booking.id,
        providerHandle: provider.handle,
        providerName: provider.display_name ?? provider.handle,
        serviceName: service.name,
        startAt: booking.start_at,
        customerName: sanitizedCustomerName,
      },
    },
  ];

  if (customerRow.phone) {
    notifications.push({
      booking_id: booking.id,
      channel: "whatsapp" as const,
      recipient: customerRow.phone,
      payload: {
        type: "booking_customer_pending" as const,
        bookingId: booking.id,
        providerHandle: provider.handle,
        providerName: provider.display_name ?? provider.handle,
        serviceName: service.name,
        startAt: booking.start_at,
        customerName: sanitizedCustomerName,
      },
    });
  }

  const { error: notificationError } = await supabase.from("notifications").insert(notifications);

  if (notificationError) {
    console.error(notificationError);
    return NextResponse.json({ error: "Failed to queue notification" }, { status: 500, headers: successHeaders });
  }

  return NextResponse.json(
    {
      booking: {
        id: booking.id,
        startAt: booking.start_at,
        endAt: booking.end_at,
        status: booking.status,
      },
      message: "Booking received. We will confirm shortly via WhatsApp and email.",
    },
    { headers: successHeaders },
  );
}
