# Book-N-Pay

Book-N-Pay is a lean SaaS for Jamaican service providers. Providers publish a public booking page, accept requests, and only pay when they confirm appointments. The stack is designed for quick shipping on Vercel with Supabase providing authentication, Postgres, and storage.

## Tech Stack

- Next.js 14 (App Router, TypeScript, Tailwind CSS)
- Supabase (Postgres, Auth, Storage) with Row Level Security enabled by default
- Zod + React Hook Form for validation and forms
- Vitest for unit and integration tests
- Playwright (placeholder) for E2E automation

## Getting Started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a `.env.local` file with your Supabase keys:

   ```bash
   NEXT_PUBLIC_APP_URL="http://localhost:3000"
   SUPABASE_URL="https://<your-project>.supabase.co"
   SUPABASE_ANON_KEY="<anon-key>"
   SUPABASE_SERVICE_ROLE_KEY="<service-role-key>"
   ```

3. Run database migrations using the Supabase CLI:

   ```bash
   supabase db push
   ```

4. Start the development server:

   ```bash
   npm run dev
   ```

   Visit `http://localhost:3000/demo` to explore the demo provider page if Supabase is not yet configured.

## Authentication & Onboarding

- Providers sign in from `/login` using passwordless email OTP. Configure your Supabase project to enable Email OTP under **Authentication → Providers**.
- The first successful login automatically bootstraps a user profile row. Visiting `/onboarding` collects the provider display name, booking handle, phone number, and preferred currency.
- Handles are normalized to URL-safe slugs and must be unique. The onboarding form prevents collisions and saves both the Supabase `users` and `providers` tables.

## Testing

Execute the Vitest suite (includes wallet math and availability logic):

```bash
npm run test
```

Type checking and linting are available via:

```bash
npm run typecheck
npm run lint
```

## Pay-Per-Booking Fallback

When a provider runs out of wallet credits, the booking confirmation API responds with `requires_payment`, a hosted checkout URL,
and a `paymentReference`. The reference is persisted in the `payments` table and is required when reconciling payment webhooks.

Send simulated gateway callbacks to `POST /api/payments/webhook` with JSON containing a `refId` and `status`. A `status` of
`"succeeded"` marks the payment as complete, updates the booking to `confirmed`, and enqueues an email receipt notification for the
customer.

## Supabase Policies

All tables ship with deny-by-default RLS policies. Providers can only view and update rows they own, while the public booking page exposes limited read-only data for services, availability rules, and blackout dates. Review the SQL in `supabase/migrations/0001_initial.sql` and `supabase/policies/0001_rls.sql` before deployment.

## Deployment Notes

- Configure Supabase webhooks or scheduled functions to process payment webhooks and send notifications.
- Implement the `PaymentGateway` interface with a production provider (e.g., WiPay or FAC) when ready.
- Use Supabase cron or Vercel Cron to send reminder notifications and reconcile wallet ledger entries.

## Runbook

- **On-call contact:** Fill in once the support process is defined.
- **Smoke test:**
  1. Create a booking via `POST /api/public/booking/create`.
  2. Confirm the booking via `POST /api/booking/confirm`.
  3. Ensure the wallet ledger records the deduction and a notification row is created.
- **Rollback:** Each migration is idempotent; create corresponding `down` scripts if your team requires full rollback automation.

