"use client";

import { useFormState } from "react-dom";

export interface OnboardingFormState {
  error?: string;
  success?: boolean;
}

export interface ProviderOnboardingFormProps {
  action: (state: OnboardingFormState, formData: FormData) => Promise<OnboardingFormState>;
  defaultValues: {
    displayName: string;
    handle: string;
    currency: string;
    phone: string;
  };
  email?: string | null;
}

const initialState: OnboardingFormState = {};

export function ProviderOnboardingForm({ action, defaultValues, email }: ProviderOnboardingFormProps) {
  const [state, formAction] = useFormState(action, initialState);

  return (
    <form action={formAction} className="space-y-6 rounded-lg bg-slate-900 p-6 shadow-lg">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold text-white">Complete your provider profile</h1>
        <p className="text-sm text-slate-400">
          We&apos;ll use these details on your public booking page and for payouts.
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1 text-sm font-medium text-slate-200">
          Display name
          <input
            type="text"
            name="displayName"
            defaultValue={defaultValues.displayName}
            placeholder="Fresh Fade Studio"
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            required
          />
        </label>

        <label className="space-y-1 text-sm font-medium text-slate-200">
          Booking handle
          <input
            type="text"
            name="handle"
            defaultValue={defaultValues.handle}
            placeholder="fresh-fade-ja"
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            required
          />
          <p className="text-xs text-slate-500">
            Your booking link will be <span className="text-slate-300">booknpay.com/@handle</span>
          </p>
        </label>

        <label className="space-y-1 text-sm font-medium text-slate-200">
          Phone number
          <input
            type="tel"
            name="phone"
            defaultValue={defaultValues.phone}
            placeholder="876-555-1234"
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            required
          />
        </label>

        <label className="space-y-1 text-sm font-medium text-slate-200">
          Currency
          <select
            name="currency"
            defaultValue={defaultValues.currency}
            className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            required
          >
            <option value="JMD">JMD — Jamaican Dollar</option>
            <option value="USD">USD — US Dollar</option>
          </select>
        </label>
      </div>

      {email ? (
        <p className="text-xs text-slate-500">We&apos;ll reach you at {email} for confirmations and receipts.</p>
      ) : null}

      {state.error ? <p className="text-sm text-rose-400">{state.error}</p> : null}
      {state.success ? <p className="text-sm text-emerald-400">Profile saved. You&apos;re good to go!</p> : null}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-primary/90"
        >
          Save profile
        </button>
        <p className="text-xs text-slate-500">
          We protect your data with Row Level Security so only you can see it.
        </p>
      </div>
    </form>
  );
}
