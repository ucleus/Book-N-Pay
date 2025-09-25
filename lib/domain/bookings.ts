import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export type ProviderBookingListItem = {
  id: string;
  status: "pending" | "confirmed" | "cancelled" | "completed" | "no_show";
  startAt: string;
  endAt: string | null;
  createdAt: string;
  serviceName: string;
  serviceDurationMin: number | null;
  servicePriceCents: number | null;
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  payMode: "credit" | "per_booking" | null;
  notes: string | null;
};

type ProviderBookingRow = {
  id: string;
  status: ProviderBookingListItem["status"];
  start_at: string;
  end_at: string | null;
  created_at: string;
  pay_mode: ProviderBookingListItem["payMode"];
  notes: string | null;
  services?: {
    name?: string | null;
    duration_min?: number | null;
    base_price_cents?: number | null;
  } | null;
  customers?: {
    name?: string | null;
    email?: string | null;
    phone?: string | null;
  } | null;
};

export interface ProviderBookingsOverview {
  pending: ProviderBookingListItem[];
  upcoming: ProviderBookingListItem[];
  recent: ProviderBookingListItem[];
}

export function mapBookingRow(row: ProviderBookingRow): ProviderBookingListItem {
  return {
    id: row.id,
    status: row.status,
    startAt: row.start_at,
    endAt: row.end_at ?? null,
    createdAt: row.created_at,
    serviceName: row.services?.name ?? "Service",
    serviceDurationMin: row.services?.duration_min ?? null,
    servicePriceCents: row.services?.base_price_cents ?? null,
    customerName: row.customers?.name ?? "Client",
    customerEmail: row.customers?.email ?? null,
    customerPhone: row.customers?.phone ?? null,
    payMode: row.pay_mode ?? null,
    notes: row.notes ?? null,
  };
}

export async function fetchProviderBookingsOverview(
  supabase: SupabaseClient<Database>,
  providerId: string,
  now: Date = new Date(),
): Promise<ProviderBookingsOverview> {
  const nowIso = now.toISOString();

  const selectColumns =
    "id, status, start_at, end_at, created_at, pay_mode, notes, services(name, duration_min, base_price_cents), customers(name, email, phone)";

  const [pendingRes, upcomingRes, recentRes] = await Promise.all([
    supabase
      .from("bookings")
      .select(selectColumns)
      .eq("provider_id", providerId)
      .eq("status", "pending")
      .order("start_at", { ascending: true })
      .limit(50),
    supabase
      .from("bookings")
      .select(selectColumns)
      .eq("provider_id", providerId)
      .eq("status", "confirmed")
      .gte("start_at", nowIso)
      .order("start_at", { ascending: true })
      .limit(50),
    supabase
      .from("bookings")
      .select(selectColumns)
      .eq("provider_id", providerId)
      .lt("start_at", nowIso)
      .order("start_at", { ascending: false })
      .limit(20),
  ]);

  const responses = [
    { label: "pending bookings", response: pendingRes },
    { label: "upcoming bookings", response: upcomingRes },
    { label: "recent bookings", response: recentRes },
  ];

  for (const { label, response } of responses) {
    if (response.error) {
      throw new Error(`Failed to load ${label}: ${response.error.message}`);
    }
  }

  return {
    pending: (pendingRes.data ?? []).map((row) => mapBookingRow(row as ProviderBookingRow)),
    upcoming: (upcomingRes.data ?? []).map((row) => mapBookingRow(row as ProviderBookingRow)),
    recent: (recentRes.data ?? []).map((row) => mapBookingRow(row as ProviderBookingRow)),
  };
}
