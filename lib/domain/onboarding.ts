import { providerOnboardingSchema, type ProviderOnboardingInput } from "@/lib/validation/onboarding";
import { slugifyHandle } from "@/lib/utils/slugify";

export interface PreparedOnboardingPayload {
  displayName: string;
  handle: string;
  currency: string;
  phone: string;
}

export function prepareProviderOnboardingPayload(input: ProviderOnboardingInput): PreparedOnboardingPayload {
  const parsed = providerOnboardingSchema.parse(input);
  const handle = slugifyHandle(parsed.handle);

  if (handle.length < 3) {
    throw new Error("HANDLE_INVALID");
  }

  const currency = parsed.currency.toUpperCase();
  const phone = normalizePhone(parsed.phone);

  return {
    displayName: parsed.displayName,
    handle,
    currency,
    phone,
  };
}

export function normalizePhone(raw: string): string {
  const digits = raw.replace(/[^0-9+]/g, "");
  if (digits.startsWith("+")) {
    return `+${digits.replace(/[^0-9]/g, "")}`;
  }

  return digits.replace(/[^0-9]/g, "");
}
