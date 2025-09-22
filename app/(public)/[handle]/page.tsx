import { notFound } from "next/navigation";
import { getPublicClient } from "@/lib/supabase/server";
import type { ProviderProfile, Service, AvailabilityRule, BlackoutDate } from "@/lib/domain/types";
import { generateBookableSlots } from "@/lib/domain/availability";
import { ServiceList } from "@/components/service-list";
import { AvailabilitySlotPicker } from "@/components/availability-slot-picker";

interface ProviderPageData {
  provider: ProviderProfile;
  services: Service[];
  availability: AvailabilityRule[];
  blackoutDates: BlackoutDate[];
}

const fallbackProvider: ProviderPageData = {
  provider: {
    id: "demo",
    displayName: "Demo Barber",
    handle: "demo",
    bio: "Kingston-based barber specializing in sharp fades and clean beard trims.",
    currency: "JMD",
  },
  services: [
    {
      id: "haircut",
      providerId: "demo",
      name: "Premium Haircut",
      description: "Full haircut with line up and razor finish.",
      durationMin: 45,
      basePriceCents: 3500 * 100,
      isActive: true,
    },
    {
      id: "beard",
      providerId: "demo",
      name: "Beard Grooming",
      description: "Clean up, sculpting, and conditioning for your beard.",
      durationMin: 30,
      basePriceCents: 2200 * 100,
      isActive: true,
    },
  ],
  availability: [
    { id: "1", providerId: "demo", dow: 3, startTime: "10:00", endTime: "18:00" },
    { id: "2", providerId: "demo", dow: 5, startTime: "09:00", endTime: "17:00" },
    { id: "3", providerId: "demo", dow: 6, startTime: "09:00", endTime: "14:00" },
  ],
  blackoutDates: [],
};

async function loadProviderData(handle: string): Promise<ProviderPageData | null> {
  try {
    const supabase = getPublicClient();
    const { data, error } = await supabase
      .from("providers")
      .select(
        `id, display_name, handle, bio, currency,
         services:services(id, provider_id, name, description, duration_min, base_price_cents, is_active),
         availability_rules(id, provider_id, dow, start_time, end_time),
         blackout_dates(id, provider_id, day, reason)`
      )
      .eq("handle", handle)
      .maybeSingle();

    if (error) {
      console.error(error);
      return null;
    }

    if (!data) {
      return null;
    }

    return {
      provider: {
        id: data.id,
        displayName: data.display_name,
        handle: data.handle,
        bio: data.bio,
        currency: data.currency,
      },
      services: (data.services ?? [])
        .filter((service: any) => service.is_active)
        .map((service: any) => ({
          id: service.id,
          providerId: service.provider_id,
          name: service.name,
          description: service.description,
          durationMin: service.duration_min,
          basePriceCents: service.base_price_cents,
          isActive: service.is_active,
        })),
      availability: (data.availability_rules ?? []).map((rule: any) => ({
        id: rule.id,
        providerId: rule.provider_id,
        dow: rule.dow,
        startTime: rule.start_time,
        endTime: rule.end_time,
      })),
      blackoutDates: (data.blackout_dates ?? []).map((b: any) => ({
        id: b.id,
        providerId: b.provider_id,
        day: b.day,
        reason: b.reason,
      })),
    };
  } catch (error) {
    console.warn("Falling back to demo provider page because Supabase is not configured", error);
    return fallbackProvider;
  }
}

interface ProviderPageProps {
  params: { handle: string };
}

export default async function ProviderPage({ params }: ProviderPageProps) {
  const data = await loadProviderData(params.handle);

  if (!data) {
    notFound();
  }

  const primaryService = data.services[0];
  const slots = primaryService
    ? generateBookableSlots({
        rules: data.availability,
        blackoutDates: data.blackoutDates,
        serviceDurationMin: primaryService.durationMin,
        days: 14,
      })
    : [];

  return (
    <div className="space-y-8">
      <header className="space-y-4">
        <h1 className="text-3xl font-bold text-white">{data.provider.displayName}</h1>
        {data.provider.bio ? <p className="text-slate-300">{data.provider.bio}</p> : null}
      </header>

      <section className="grid gap-6 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          <h2 className="text-xl font-semibold text-white">Services</h2>
          <ServiceList services={data.services} currency={data.provider.currency} />
        </div>
        <div className="space-y-4 lg:col-span-2">
          <h2 className="text-xl font-semibold text-white">Available Slots</h2>
          <AvailabilitySlotPicker slots={slots} />
          <p className="text-xs text-slate-400">
            After you request a slot we’ll send confirmation by email and WhatsApp once your provider approves the booking.
          </p>
        </div>
      </section>
    </div>
  );
}
