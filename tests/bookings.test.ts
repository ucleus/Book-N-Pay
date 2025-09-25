import { describe, expect, it } from "vitest";
import { mapBookingRow } from "@/lib/domain/bookings";

describe("mapBookingRow", () => {
  it("maps Supabase row data to booking list item with relationships", () => {
    const result = mapBookingRow({
      id: "booking-1",
      status: "pending",
      start_at: "2024-05-01T14:00:00.000Z",
      end_at: "2024-05-01T15:00:00.000Z",
      created_at: "2024-04-28T12:00:00.000Z",
      pay_mode: "credit",
      notes: "Initial request",
      services: {
        name: "Haircut",
        duration_min: 60,
        base_price_cents: 4500,
      },
      customers: {
        name: "Tia",
        email: "tia@example.com",
        phone: "+18765550123",
      },
    });

    expect(result).toEqual({
      id: "booking-1",
      status: "pending",
      startAt: "2024-05-01T14:00:00.000Z",
      endAt: "2024-05-01T15:00:00.000Z",
      createdAt: "2024-04-28T12:00:00.000Z",
      serviceName: "Haircut",
      serviceDurationMin: 60,
      servicePriceCents: 4500,
      customerName: "Tia",
      customerEmail: "tia@example.com",
      customerPhone: "+18765550123",
      payMode: "credit",
      notes: "Initial request",
    });
  });

  it("falls back to defaults when relations are missing", () => {
    const result = mapBookingRow({
      id: "booking-2",
      status: "confirmed",
      start_at: "2024-05-02T10:00:00.000Z",
      end_at: null,
      created_at: "2024-04-29T12:00:00.000Z",
      pay_mode: null,
      notes: null,
      services: null,
      customers: undefined,
    });

    expect(result).toEqual({
      id: "booking-2",
      status: "confirmed",
      startAt: "2024-05-02T10:00:00.000Z",
      endAt: null,
      createdAt: "2024-04-29T12:00:00.000Z",
      serviceName: "Service",
      serviceDurationMin: null,
      servicePriceCents: null,
      customerName: "Client",
      customerEmail: null,
      customerPhone: null,
      payMode: null,
      notes: null,
    });
  });
});
