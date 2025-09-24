import { NextResponse, type NextRequest } from "next/server";
import { MockPaymentGateway } from "@/lib/domain/payments";
import { getServiceRoleClient } from "@/lib/supabase/server";
import { resolvePaymentEvent } from "@/lib/domain/payment-webhook";
import type { BookingStatus } from "@/lib/domain/types";
import type { Database, Json } from "@/types/database";

type PaymentStatus = "initiated" | "succeeded" | "failed" | "refunded";

type BookingRow = {
  id: string;
  status: string;
  customer_id: string | null;
  service_id: string;
  start_at: string;
};

type CustomerRow = {
  email: string | null;
  name: string | null;
  phone: string | null;
};

type ProviderRow = {
  display_name: string;
};

type ServiceRow = {
  id: string;
  name: string | null;
};

const GATEWAY_ID = "mockpay";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("x-mock-signature") ?? "";

  const gateway = new MockPaymentGateway();
  if (!gateway.verifyWebhook(signature, rawBody)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let payload: Json;
  try {
    payload = JSON.parse(rawBody) as Json;
  } catch (error) {
    console.error("Unable to parse webhook payload", error);
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const event = gateway.parseEvent(rawBody);

  let supabase;
  try {
    supabase = getServiceRoleClient();
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: "Server misconfigured" }, { status: 500 });
  }

  const { data: existingEvent, error: fetchEventError } = await supabase
    .from("webhook_events")
    .select("id, processed_at")
    .eq("gateway", GATEWAY_ID)
    .eq("external_id", event.refId)
    .maybeSingle();

  if (fetchEventError) {
    console.error(fetchEventError);
    return NextResponse.json({ error: "Unable to load webhook event" }, { status: 500 });
  }

  if (existingEvent?.processed_at) {
    return NextResponse.json({ message: "Event already processed" });
  }

  let webhookEventId = existingEvent?.id ?? null;

  if (!webhookEventId) {
    const { data: insertedEvent, error: insertEventError } = await supabase
      .from("webhook_events")
      .insert({
        gateway: GATEWAY_ID,
        external_id: event.refId,
        payload,
      })
      .select("id")
      .maybeSingle();

    if (insertEventError || !insertedEvent) {
      console.error(insertEventError);
      return NextResponse.json({ error: "Unable to record webhook" }, { status: 500 });
    }

    webhookEventId = insertedEvent.id;
  } else {
    const { error: updateEventError } = await supabase
      .from("webhook_events")
      .update({ payload })
      .eq("id", webhookEventId);

    if (updateEventError) {
      console.error(updateEventError);
      return NextResponse.json({ error: "Unable to persist webhook payload" }, { status: 500 });
    }
  }

  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id, booking_id, provider_id, status, amount_cents")
    .eq("gateway", GATEWAY_ID)
    .eq("gateway_ref", event.refId)
    .maybeSingle();

  if (paymentError) {
    console.error(paymentError);
    return NextResponse.json({ error: "Unable to load payment" }, { status: 500 });
  }

  if (!payment) {
    if (webhookEventId) {
      await supabase
        .from("webhook_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", webhookEventId);
    }

    return NextResponse.json({ message: "No matching payment" });
  }

  let booking: BookingRow | null = null;

  if (payment.booking_id) {
    const { data: bookingRow, error: bookingError } = await supabase
      .from("bookings")
      .select("id, status, customer_id, service_id, start_at")
      .eq("id", payment.booking_id)
      .maybeSingle();

    if (bookingError) {
      console.error(bookingError);
      return NextResponse.json({ error: "Unable to load booking" }, { status: 500 });
    }

    booking = bookingRow;
  }

  const resolution = resolvePaymentEvent({
    eventType: event.type,
    payment: { status: payment.status as PaymentStatus },
    booking: booking ? { status: booking.status as BookingStatus } : null,
  });

  if (resolution.alreadyProcessed) {
    if (webhookEventId) {
      await supabase
        .from("webhook_events")
        .update({ processed_at: new Date().toISOString() })
        .eq("id", webhookEventId);
    }

    return NextResponse.json({ message: resolution.message });
  }

  let customer: CustomerRow | null = null;
  const needsCustomer = Boolean(
    booking?.customer_id && (resolution.shouldCreateReceiptNotification || resolution.shouldConfirmBooking),
  );

  if (needsCustomer && booking?.customer_id) {
    const { data: customerRow, error: customerError } = await supabase
      .from("customers")
      .select("email, name, phone")
      .eq("id", booking.customer_id)
      .maybeSingle();

    if (customerError) {
      console.error(customerError);
      return NextResponse.json({ error: "Unable to load customer" }, { status: 500 });
    }

    customer = customerRow;
  }

  let service: ServiceRow | null = null;
  if (booking && resolution.shouldConfirmBooking) {
    const { data: serviceRow, error: serviceError } = await supabase
      .from("services")
      .select("id, name")
      .eq("id", booking.service_id)
      .maybeSingle();

    if (serviceError) {
      console.error(serviceError);
      return NextResponse.json({ error: "Unable to load service" }, { status: 500 });
    }

    service = serviceRow;
  }

  let providerProfile: ProviderRow | null = null;
  if (resolution.shouldCreateReceiptNotification || resolution.shouldConfirmBooking) {
    const { data: providerRow, error: providerError } = await supabase
      .from("providers")
      .select("display_name")
      .eq("id", payment.provider_id)
      .maybeSingle();

    if (providerError) {
      console.error(providerError);
      return NextResponse.json({ error: "Unable to load provider" }, { status: 500 });
    }

    providerProfile = providerRow;
  }

  if (resolution.shouldUpdatePayment) {
    const { error: updatePaymentError } = await supabase
      .from("payments")
      .update({ status: resolution.nextPaymentStatus })
      .eq("id", payment.id);

    if (updatePaymentError) {
      console.error(updatePaymentError);
      return NextResponse.json({ error: "Failed to update payment" }, { status: 500 });
    }
  }

  if (resolution.shouldConfirmBooking && booking) {
    const { error: updateBookingError } = await supabase
      .from("bookings")
      .update({ status: "confirmed", pay_mode: "per_booking", updated_at: new Date().toISOString() })
      .eq("id", booking.id);

    if (updateBookingError) {
      console.error(updateBookingError);
      return NextResponse.json({ error: "Failed to confirm booking" }, { status: 500 });
    }
  }

  const notifications: Database["public"]["Tables"]["notifications"]["Insert"][] = [];

  if (resolution.shouldConfirmBooking && booking && providerProfile && service) {
    const payload = {
      type: "booking_customer_confirmed" as const,
      bookingId: booking.id,
      providerName: providerProfile.display_name,
      serviceName: service.name ?? "your booking",
      startAt: booking.start_at,
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
  }

  if (resolution.shouldCreateReceiptNotification && booking && providerProfile) {
    const receiptPayload = {
      type: "per_booking_receipt" as const,
      amountCents: payment.amount_cents,
      bookingId: booking.id,
      providerName: providerProfile.display_name,
      serviceName: service?.name ?? undefined,
    };

    if (customer?.email) {
      notifications.push({
        booking_id: booking.id,
        channel: "email",
        recipient: customer.email,
        payload: receiptPayload,
      });
    }

    if (customer?.phone) {
      notifications.push({
        booking_id: booking.id,
        channel: "whatsapp",
        recipient: customer.phone,
        payload: receiptPayload,
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

  if (webhookEventId) {
    await supabase
      .from("webhook_events")
      .update({ processed_at: new Date().toISOString() })
      .eq("id", webhookEventId);
  }

  return NextResponse.json({ message: resolution.message });
}
