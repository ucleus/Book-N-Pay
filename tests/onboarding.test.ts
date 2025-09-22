import { describe, expect, it } from "vitest";
import { normalizePhone, prepareProviderOnboardingPayload } from "@/lib/domain/onboarding";

describe("prepareProviderOnboardingPayload", () => {
  it("normalizes handle, currency, and phone", () => {
    const payload = prepareProviderOnboardingPayload({
      displayName: "Fresh Fade Studio",
      handle: "Fresh Fade! Studio",
      currency: "jmd",
      phone: "(876) 555-1234",
    });

    expect(payload.handle).toBe("fresh-fade-studio");
    expect(payload.currency).toBe("JMD");
    expect(payload.phone).toBe("8765551234");
  });

  it("throws when handle becomes empty", () => {
    expect(() =>
      prepareProviderOnboardingPayload({
        displayName: "Test",
        handle: "!!!",
        currency: "JMD",
        phone: "8765550000",
      }),
    ).toThrowError("HANDLE_INVALID");
  });
});

describe("normalizePhone", () => {
  it("preserves E.164 prefix", () => {
    expect(normalizePhone("+1 (876) 555-9999")).toBe("+18765559999");
  });
});
