import { z } from "zod";

const phoneRegex = /^[0-9+()\-\s]+$/;

export const providerOnboardingSchema = z.object({
  displayName: z
    .string({ required_error: "Display name is required" })
    .trim()
    .min(3, "Display name must be at least 3 characters")
    .max(80, "Display name must be at most 80 characters"),
  handle: z
    .string({ required_error: "Handle is required" })
    .trim()
    .min(3, "Handle must be at least 3 characters")
    .max(40, "Handle must be at most 40 characters"),
  currency: z
    .string({ required_error: "Currency is required" })
    .trim()
    .length(3, "Currency must be a 3-letter ISO code"),
  phone: z
    .string({ required_error: "Phone number is required" })
    .trim()
    .min(7, "Phone number looks too short")
    .max(20, "Phone number looks too long")
    .regex(phoneRegex, "Phone can include numbers, spaces, parentheses, plus, and hyphen"),
});

export type ProviderOnboardingInput = z.infer<typeof providerOnboardingSchema>;
