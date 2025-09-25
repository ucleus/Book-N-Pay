"use client";

import { useState, type FormEvent } from "react";

export function EmailOtpForm() {
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();
  const [email, setEmail] = useState("");
  const [isSubmitting, setSubmitting] = useState(false);

  async function requestOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!email) {
      setError("Email is required");
      setMessage(undefined);
      return;
    }

    setSubmitting(true);
    setError(undefined);
    setMessage(undefined);

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

      setMessage("We sent a sign-in link to your email. Follow the link to continue.");
    } catch (error) {
      console.error(error);
      setError(error instanceof Error ? error.message : "Unable to send code");
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

      <form onSubmit={requestOtp} className="space-y-4">
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
          />
        </div>

        {error ? <p className="text-sm text-rose-400">{error}</p> : null}
        {message ? <p className="text-sm text-emerald-400">{message}</p> : null}

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
        >
          Send magic link
        </button>
      </form>
    </div>
  );
}
