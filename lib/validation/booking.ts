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

export const rescheduleBookingSchema = z.object({
  bookingId: z.string().uuid(),
  providerId: z.string().uuid(),
  newStartAt: z.string().datetime(),
  chargeCustomerFee: z.boolean().optional(),
  note: z.string().max(500).optional(),
});

export type RescheduleBookingInput = z.infer<typeof rescheduleBookingSchema>;

export const cancelBookingSchema = z.object({
  bookingId: z.string().uuid(),
  providerId: z.string().uuid(),
  reason: z.string().max(500).optional(),
  cancelledBy: z.enum(["provider", "customer"]).optional(),
});

export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;

export const checkAvailabilitySchema = z.object({
  providerHandle: z.string().min(2),
  serviceId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type CheckAvailabilityInput = z.infer<typeof checkAvailabilitySchema>;
