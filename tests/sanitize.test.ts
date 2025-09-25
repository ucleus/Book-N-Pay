import { describe, expect, it } from "vitest";

import { sanitizeHandle, sanitizePlainText, sanitizePhone, sanitizeOtpCode } from "@/lib/utils/sanitize";

describe("sanitize utilities", () => {
  it("strips unsafe characters from handles", () => {
    expect(sanitizeHandle("barber<script>")).toBe("barber");
    expect(sanitizeHandle("Pro_Stylist!")).toBe("Pro_Stylist");
  });

  it("removes control characters from text", () => {
    expect(sanitizePlainText("hi\u0000there<alert>")).toBe("hitherealert");
  });

  it("keeps numeric and plus values in phone numbers", () => {
    expect(sanitizePhone("+1 (876) 555-1212")).toBe("+18765551212");
  });

  it("only keeps digits in otp codes", () => {
    expect(sanitizeOtpCode("12-34\n56")).toBe("123456");
  });
});
