import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getServerComponentClient, getServerActionClient } from "@/lib/supabase/server";
import { ProviderOnboardingForm, type OnboardingFormState } from "@/components/provider-onboarding-form";
import { providerOnboardingSchema } from "@/lib/validation/onboarding";
import { prepareProviderOnboardingPayload } from "@/lib/domain/onboarding";

export default async function OnboardingPage() {
  const supabase = getServerComponentClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/onboarding");
  }

  const [{ data: providerProfile }, { data: userProfile }] = await Promise.all([
    supabase
      .from("providers")
      .select("id, display_name, handle, currency")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("users")
      .select("phone")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  async function completeOnboarding(_: OnboardingFormState, formData: FormData): Promise<OnboardingFormState> {
    "use server";

    const supabase = getServerActionClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return { error: "Please sign in to continue." };
    }

    const result = providerOnboardingSchema.safeParse({
      displayName: formData.get("displayName"),
      handle: formData.get("handle"),
      currency: formData.get("currency"),
      phone: formData.get("phone"),
    });

    if (!result.success) {
      return { error: "Some fields need attention. Check the inputs and try again." };
    }

    let payload;
    try {
      payload = prepareProviderOnboardingPayload(result.data);
    } catch (error) {
      if (error instanceof Error && error.message === "HANDLE_INVALID") {
        return { error: "Handle must include letters or numbers." };
      }
      console.error(error);
      return { error: "Unable to prepare profile data." };
    }

    const { data: conflictingHandle, error: handleLookupError } = await supabase
      .from("providers")
      .select("id, user_id")
      .eq("handle", payload.handle)
      .maybeSingle();

    if (handleLookupError) {
      console.error(handleLookupError);
      return { error: "Could not validate handle availability." };
    }

    if (conflictingHandle && conflictingHandle.user_id !== user.id) {
      return { error: "That handle is already taken. Choose another." };
    }

    const { error: profileError } = await supabase
      .from("users")
      .upsert(
        {
          id: user.id,
          email: user.email ?? result.data.displayName,
          phone: payload.phone,
          role: "provider",
        },
        { onConflict: "id" },
      );

    if (profileError) {
      console.error(profileError);
      return { error: "Unable to save contact details." };
    }

    const { error: providerError } = await supabase
      .from("providers")
      .upsert(
        {
          user_id: user.id,
          display_name: payload.displayName,
          handle: payload.handle,
          currency: payload.currency,
        },
        { onConflict: "user_id" },
      );

    if (providerError) {
      console.error(providerError);
      return { error: "Unable to save provider profile." };
    }

    revalidatePath("/onboarding");
    return { success: true };
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 py-8">
      <ProviderOnboardingForm
        action={completeOnboarding}
        defaultValues={{
          displayName: providerProfile?.display_name ?? "",
          handle: providerProfile?.handle ?? "",
          currency: providerProfile?.currency ?? "JMD",
          phone: userProfile?.phone ?? "",
        }}
        email={user.email}
      />
    </div>
  );
}
