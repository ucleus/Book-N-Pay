export type UUID = string;

export interface ProviderProfile {
  id: UUID;
  displayName: string;
  handle: string;
  bio: string | null;
  currency: string;
}

export interface Service {
  id: UUID;
  providerId: UUID;
  name: string;
  description: string | null;
  durationMin: number;
  basePriceCents: number;
  isActive: boolean;
}

export interface AvailabilityRule {
  id: UUID;
  providerId: UUID;
  dow: number; // 0-6
  startTime: string; // HH:MM:SS
  endTime: string; // HH:MM:SS
}

export interface BlackoutDate {
  id: UUID;
  providerId: UUID;
  day: string; // YYYY-MM-DD
  reason: string | null;
}

export type BookingStatus = "pending" | "confirmed" | "cancelled" | "completed" | "no_show";

export interface Booking {
  id: UUID;
  providerId: UUID;
  serviceId: UUID;
  customerId: UUID;
  startAt: string;
  endAt: string;
  status: BookingStatus;
  payMode?: "credit" | "per_booking" | null;
}

export interface Wallet {
  id: UUID;
  providerId: UUID;
  balanceCredits: number;
  currency: string;
}

export interface WalletLedgerEntry {
  id: UUID;
  walletId: UUID;
  bookingId?: UUID;
  changeCredits: number;
  description: string;
  createdAt: string;
}

export interface CustomerInput {
  name: string;
  email: string;
  phone: string;
}
