import Link from "next/link";
import { redirect } from "next/navigation";
import { format } from "date-fns";
import { getServerComponentClient } from "@/lib/supabase/server";
import {
  fetchProviderDashboardSummary,
  fetchUpcomingBookings,
} from "@/lib/domain/reporting";

function MetricCard({
  label,
  value,
  helper,
}: {
  label: string;
  value: number | string;
  helper?: string;
}) {
  const displayValue =
    typeof value === "number" ? value.toLocaleString("en-US") : value;

  return (
    <article className="card space-y-2">
      <p className="text-sm uppercase tracking-wide text-slate-400">{label}</p>
      <p className="text-3xl font-semibold text-white">{displayValue}</p>
      {helper ? <p className="text-xs text-slate-400">{helper}</p> : null}
    </article>
  );
}

export default async function DashboardPage() {
  const supabase = getServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/dashboard");
  }

  const { data: provider, error: providerError } = await supabase
    .from("providers")
    .select("id, display_name")
    .eq("user_id", user.id)
    .maybeSingle();

  if (providerError) {
    console.error(providerError);
    throw new Error("Unable to load provider profile");
  }

  if (!provider) {
    redirect("/onboarding");
  }

  const [summary, upcomingBookings] = await Promise.all([
    fetchProviderDashboardSummary(supabase, provider.id),
    fetchUpcomingBookings(supabase, provider.id),
  ]);

  const metrics = [
    {
      label: "Upcoming confirmed",
      value: summary.upcomingConfirmed,
      helper: "Future confirmed bookings",
    },
    {
      label: "Today",
      value: summary.todayConfirmed,
      helper: "Confirmed bookings happening today",
    },
    {
      label: "This week",
      value: summary.weekConfirmed,
      helper: "Confirmed bookings scheduled this week",
    },
    {
      label: "Pending approval",
      value: summary.pendingCount,
      helper: "Bookings waiting on your confirmation",
    },
  ];

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <h1 className="text-3xl font-semibold text-white">Dashboard overview</h1>
          <p className="text-sm text-slate-400">
            Welcome back{provider.display_name ? `, ${provider.display_name}` : ""}. Here’s the current pulse of your
            bookings.
          </p>
        </div>
        <Link
          className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
          href="/bookings"
        >
          Manage bookings
        </Link>
      <header className="space-y-2">
        <h1 className="text-3xl font-semibold text-white">Dashboard overview</h1>
        <p className="text-sm text-slate-400">
          Welcome back{provider.display_name ? `, ${provider.display_name}` : ""}. Here’s the current pulse of your
          bookings.
        </p>
      </header>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} {...metric} />
        ))}
      </section>

      <section className="card space-y-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-white">Conversion health</h2>
            <p className="text-sm text-slate-400">
              {summary.recentConversion.confirmed} of {summary.recentConversion.total} bookings created in the last {" "}
              {summary.recentConversion.windowDays} days were confirmed.
            </p>
          </div>
          <span className="text-3xl font-semibold text-white">
            {summary.recentConversion.ratePercent.toFixed(1)}%
          </span>
        </div>
        <p className="text-xs text-slate-500">
          Keep following up on pending bookings to lift your conversion rate.
        </p>
      </section>

      <section className="card space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-white">Next up</h2>
          <span className="text-xs uppercase tracking-wide text-slate-500">Next 5 confirmed bookings</span>
        </div>
        {upcomingBookings.length === 0 ? (
          <p className="text-sm text-slate-400">No confirmed bookings on the horizon yet. Share your link to fill the calendar.</p>
        ) : (
          <ul className="space-y-3">
            {upcomingBookings.map((booking) => (
              <li
                key={booking.id}
                className="flex flex-col gap-2 rounded-lg border border-slate-800 bg-slate-950/60 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div>
                  <p className="text-sm font-semibold text-white">
                    {booking.serviceName}
                    {booking.serviceDurationMin != null ? ` · ${booking.serviceDurationMin} min` : ""}
                  </p>
                  <p className="text-xs text-slate-400">{booking.customerName}</p>
                  {booking.customerPhone ? (
                    <p className="text-xs text-slate-500">{booking.customerPhone}</p>
                  ) : null}
                </div>
                <p className="text-sm font-medium text-accent">{format(new Date(booking.startAt), "EEE, MMM d • h:mma")}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
