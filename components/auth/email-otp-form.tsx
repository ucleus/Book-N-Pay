"use client";

import { useState, type FormEvent } from "react";

import { sanitizeOtpCode } from "@/lib/utils/sanitize";

interface EmailOtpFormState {
  step: "request" | "verify";
  message?: string;
  error?: string;
}

export function EmailOtpForm() {
  const [state, setState] = useState<EmailOtpFormState>({ step: "request" });
  const [email, setEmail] = useState("");
  const [isSubmitting, setSubmitting] = useState(false);

  async function requestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email) {
      setState({ step: "request", error: "Email is required" });
      return;
    }

    setSubmitting(true);
    setState({ step: "request" });

    try {
      const response = await fetch("/api/auth/email-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "Unable to send code" }));
        throw new Error(body.error ?? "Unable to send code");
      }

      setState({ step: "verify", message: "We sent a 6-digit code to your email." });
    } catch (error) {
      console.error(error);
      setState({ step: "request", error: error instanceof Error ? error.message : "Unable to send code" });
    } finally {
      setSubmitting(false);
    }
  }

  async function verifyOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const token = sanitizeOtpCode(String(formData.get("token") ?? ""));

    if (token.length !== 6) {
      setState((prev) => ({ ...prev, error: "Enter the 6-digit code from your email." }));
      return;
    }

    setSubmitting(true);
    setState((prev) => ({ ...prev, error: undefined, message: undefined }));

    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, token }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: "Verification failed" }));
        throw new Error(body.error ?? "Verification failed");
      }

      window.location.href = "/onboarding";
    } catch (error) {
      console.error(error);
      setState((prev) => ({ ...prev, error: error instanceof Error ? error.message : "Verification failed" }));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6 rounded-lg bg-slate-900 p-6 shadow-lg">
      <header className="space-y-2 text-center">
        <h1 className="text-2xl font-semibold text-white">Sign in with Email OTP</h1>
        <p className="text-sm text-slate-400">
          We&apos;ll send a magic code to your inbox. No passwords, just fast access.
        </p>
      </header>

      <form onSubmit={state.step === "request" ? requestOtp : verifyOtp} className="space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-200" htmlFor="email">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value.trim().toLowerCase())}
            placeholder="you@example.com"
            className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
            disabled={state.step === "verify"}
          />
        </div>

        {state.step === "verify" ? (
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-200" htmlFor="token">
              6-digit code
            </label>
            <input
              id="token"
              name="token"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="123456"
              className="w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/40"
              maxLength={6}
              autoFocus
            />
            <p className="text-xs text-slate-500">
              Didn&apos;t get it? Check your spam folder or request a new code.
            </p>
          </div>
        ) : null}

        {state.error ? <p className="text-sm text-rose-400">{state.error}</p> : null}
        {state.message ? <p className="text-sm text-emerald-400">{state.message}</p> : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          {state.step === "request" ? "Send code" : "Verify & continue"}
        </button>
      </form>

      {state.step === "verify" ? (
        <button
          type="button"
          onClick={() => setState({ step: "request" })}
          className="text-xs font-medium text-slate-400 underline hover:text-slate-200"
          disabled={isSubmitting}
        >
          Use a different email
        </button>
      ) : null}
    </div>
  );
}
