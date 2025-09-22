import { z } from "zod";

export const createBookingSchema = z.object({
  providerHandle: z.string().min(2),
  serviceId: z.string().uuid(),
  startAt: z.string().datetime(),
  customer: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().min(7).max(20),
  }),
  notes: z.string().max(500).optional(),
});

export type CreateBookingInput = z.infer<typeof createBookingSchema>;

export const confirmBookingSchema = z.object({
  bookingId: z.string().uuid(),
  providerId: z.string().uuid(),
});

export type ConfirmBookingInput = z.infer<typeof confirmBookingSchema>;
