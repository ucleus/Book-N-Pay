import { addDays, startOfDay, startOfWeek, subDays } from "date-fns";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

export const RECENT_CONVERSION_WINDOW_DAYS = 30;

export interface ProviderDashboardSummary {
  upcomingConfirmed: number;
  todayConfirmed: number;
  weekConfirmed: number;
  pendingCount: number;
  recentConversion: {
    confirmed: number;
    total: number;
    ratePercent: number;
    windowDays: number;
  };
}

export interface UpcomingBookingSummary {
  id: string;
  startAt: string;
  serviceName: string;
  serviceDurationMin: number | null;
  customerName: string;
  customerPhone: string | null;
}

export function calculateConversionRate(confirmed: number, total: number): number {
  if (confirmed <= 0 || total <= 0) {
    return 0;
  }

  const percent = (confirmed / total) * 100;
  return Math.round(percent * 10) / 10;
}

export async function fetchProviderDashboardSummary(
  supabase: SupabaseClient<Database>,
  providerId: string,
  now: Date = new Date(),
): Promise<ProviderDashboardSummary> {
  const todayStart = startOfDay(now);
  const tomorrowStart = addDays(todayStart, 1);
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });
  const weekEnd = addDays(weekStart, 7);
  const recentWindowStart = subDays(now, RECENT_CONVERSION_WINDOW_DAYS);

  const queries = await Promise.all([
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .eq("status", "confirmed")
      .gte("start_at", now.toISOString()),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .eq("status", "confirmed")
      .gte("start_at", todayStart.toISOString())
      .lt("start_at", tomorrowStart.toISOString()),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .eq("status", "confirmed")
      .gte("start_at", weekStart.toISOString())
      .lt("start_at", weekEnd.toISOString()),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .eq("status", "pending"),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .eq("status", "confirmed")
      .gte("created_at", recentWindowStart.toISOString()),
    supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("provider_id", providerId)
      .eq("status", "pending")
      .gte("created_at", recentWindowStart.toISOString()),
  ]);

  const [upcomingRes, todayRes, weekRes, pendingRes, recentConfirmedRes, recentPendingRes] = queries;

  const responses = [
    { label: "upcoming", response: upcomingRes },
    { label: "today", response: todayRes },
    { label: "week", response: weekRes },
    { label: "pending", response: pendingRes },
    { label: "recent confirmed", response: recentConfirmedRes },
    { label: "recent pending", response: recentPendingRes },
  ];

  for (const { label, response } of responses) {
    if (response.error) {
      throw new Error(`Failed to load ${label} bookings: ${response.error.message}`);
    }
  }

  const upcomingConfirmed = upcomingRes.count ?? 0;
  const todayConfirmed = todayRes.count ?? 0;
  const weekConfirmed = weekRes.count ?? 0;
  const pendingCount = pendingRes.count ?? 0;
  const recentConfirmed = recentConfirmedRes.count ?? 0;
  const recentPending = recentPendingRes.count ?? 0;
  const recentTotal = recentConfirmed + recentPending;

  return {
    upcomingConfirmed,
    todayConfirmed,
    weekConfirmed,
    pendingCount,
    recentConversion: {
      confirmed: recentConfirmed,
      total: recentTotal,
      ratePercent: calculateConversionRate(recentConfirmed, recentTotal),
      windowDays: RECENT_CONVERSION_WINDOW_DAYS,
    },
  };
}

type UpcomingBookingRow = {
  id: string;
  start_at: string;
  services?: { name?: string | null; duration_min?: number | null } | null;
  customers?: { name?: string | null; phone?: string | null } | null;
};

export async function fetchUpcomingBookings(
  supabase: SupabaseClient<Database>,
  providerId: string,
  now: Date = new Date(),
): Promise<UpcomingBookingSummary[]> {
  const todayStart = startOfDay(now);

  const { data, error } = await supabase
    .from("bookings")
    .select(
      "id, start_at, status, customers(name, phone), services(name, duration_min)",
    )
    .eq("provider_id", providerId)
    .eq("status", "confirmed")
    .gte("start_at", todayStart.toISOString())
    .order("start_at", { ascending: true })
    .limit(5);

  if (error) {
    throw new Error(`Failed to load upcoming bookings: ${error.message}`);
  }

  const rows = (data ?? []) as UpcomingBookingRow[];

  return rows.map((booking) => ({
    id: booking.id,
    startAt: booking.start_at,
    serviceName: booking.services?.name ?? "Service", // fallback when relations are missing
    serviceDurationMin: booking.services?.duration_min ?? null,
    customerName: booking.customers?.name ?? "Client",
    customerPhone: booking.customers?.phone ?? null,
  }));
}
