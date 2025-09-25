import Link from "next/link";
import { redirect } from "next/navigation";
import ProviderBookingsManager from "@/components/provider-bookings-manager";
import { fetchProviderBookingsOverview } from "@/lib/domain/bookings";
import { getServerComponentClient } from "@/lib/supabase/server";

export default async function BookingsPage() {
  const supabase = getServerComponentClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError) {
    console.error(authError);
    throw new Error("Unable to authenticate provider session");
  }

  if (!user) {
    redirect("/login?next=/bookings");
  }

  const { data: provider, error: providerError } = await supabase
    .from("providers")
    .select("id, display_name, currency, handle")
    .eq("user_id", user.id)
    .maybeSingle();

  if (providerError) {
    console.error(providerError);
    throw new Error("Unable to load provider profile");
  }

  if (!provider) {
    redirect("/onboarding");
  }

  const bookings = await fetchProviderBookingsOverview(supabase, provider.id);

  return (
    <div className="space-y-10">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="space-y-2">
          <p className="text-xs uppercase tracking-wide text-slate-500">Bookings</p>
          <h1 className="text-3xl font-semibold text-white">Manage your schedule</h1>
          <p className="max-w-2xl text-sm text-slate-400">
            Confirm new requests, adjust upcoming appointments, and keep tabs on recent activity for
            {" "}
            {provider.display_name || "your business"}.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link
            className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
            href="/dashboard"
          >
            Back to dashboard
          </Link>
          {provider.handle ? (
            <Link
              className="rounded-md border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-500 hover:text-white"
              href={`/@${provider.handle}`}
            >
              View public page
            </Link>
          ) : null}
        </div>
      </header>

      <ProviderBookingsManager
        providerId={provider.id}
        providerCurrency={provider.currency || "JMD"}
        initialPending={bookings.pending}
        initialUpcoming={bookings.upcoming}
        initialRecent={bookings.recent}
      />
    </div>
  );
}
