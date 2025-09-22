import { addMinutes } from "date-fns";
import { NextResponse, type NextRequest } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { createBookingSchema } from "@/lib/validation/booking";

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
    .select("id, currency, handle")
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
    .select("id, provider_id, duration_min, base_price_cents, is_active")
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
  const endDate = addMinutes(startDate, service.duration_min);

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
      start_at: startDate.toISOString(),
      end_at: endDate.toISOString(),
      status: "pending",
      notes: notes ?? null,
    })
    .select("id, start_at, end_at, status")
    .maybeSingle();

  if (bookingError) {
    console.error(bookingError);
    return NextResponse.json({ error: "Unable to create booking" }, { status: 500 });
  }

  return NextResponse.json({
    booking: {
      id: booking?.id,
      startAt: booking?.start_at,
      endAt: booking?.end_at,
      status: booking?.status,
    },
    message: "Booking received. We will confirm shortly via WhatsApp and email.",
  });
}
