import { describe, expect, it } from "vitest";
import {
  parseNotificationPayload,
  renderEmailTemplate,
  renderWhatsAppTemplate,
} from "@/lib/domain/notifications";

describe("notification templates", () => {
  it("parses and renders booking pending notifications", () => {
    const payload = {
      type: "booking_customer_pending" as const,
      bookingId: "11111111-1111-1111-1111-111111111111",
      providerHandle: "trim-spot",
      providerName: "Trim Spot",
      serviceName: "Haircut",
      startAt: "2024-05-10T14:00:00.000Z",
      customerName: "Alex",
    };

    const parsed = parseNotificationPayload(payload);
    expect(parsed).not.toBeNull();

    const email = renderEmailTemplate(parsed!);
    expect(email.subject).toContain("Haircut");
    expect(email.body).toContain("Trim Spot");

    const whatsapp = renderWhatsAppTemplate(parsed!);
    expect(whatsapp).toContain("Trim Spot");
    expect(whatsapp).toContain("Haircut");
  });

  it("builds confirmation templates with customer name", () => {
    const payload = {
      type: "booking_customer_confirmed" as const,
      bookingId: "11111111-1111-1111-1111-111111111112",
      providerName: "Glow Nails",
      serviceName: "Manicure",
      startAt: "2024-05-10T16:00:00.000Z",
      customerName: "Sam",
    };

    const parsed = parseNotificationPayload(payload);
    expect(parsed).not.toBeNull();

    const email = renderEmailTemplate(parsed!);
    expect(email.subject).toContain("Glow Nails");
    expect(email.body).toContain("Sam");

    const whatsapp = renderWhatsAppTemplate(parsed!);
    expect(whatsapp).toContain("Glow Nails");
    expect(whatsapp).toContain("Manicure");
  });

  it("renders provider low credit alerts", () => {
    const payload = {
      type: "provider_low_credits_warning" as const,
      providerName: "Fresh Cuts",
      creditsRemaining: 1,
    };

    const parsed = parseNotificationPayload(payload);
    expect(parsed).not.toBeNull();

    const email = renderEmailTemplate(parsed!);
    expect(email.subject).toContain("1 credit");
    expect(email.body).toContain("Fresh Cuts");

    const whatsapp = renderWhatsAppTemplate(parsed!);
    expect(whatsapp).toContain("1");
    expect(whatsapp).toContain("Fresh Cuts");
  });

  it("rejects invalid payloads", () => {
    expect(parseNotificationPayload({ type: "unknown" })).toBeNull();
  });
});
