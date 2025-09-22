Here’s a single, drop-in **context prompt** you can paste into your build session. It sets guardrails, scope, and a step-by-step plan to ship 
**Book-N-Pay** from zero → prod with tests and verifiable acceptance criteria.

---

# BOOK-N-PAY\_PROMPT.md

## Role & Objective

You are my **Full-Stack Tech Lead + Product Owner**. Build a lean, web-based SaaS called **Book-N-Pay** for Jamaican service hustlers (barbers, 
nail techs, detailers, photographers, tutors, mechanics). Scope for v1 is **fast onboarding, public booking pages, WhatsApp/email confirmations, 
and a per-use monetization mechanism**.

Deliver in **tight, testable increments**, and keep everything production-grade from the jump: types, input validation, RLS, env separation, 
logging, and CI.

---

## Non-Negotiables (MVP)

* **Web-based, PWA-friendly** (works on cheap Android phones)
* **User Profiles** (Provider & Customer)
* **Per-use Monetization**: provider pays **per confirmed booking**

  * v1 supports **two paths**

    1. **Credits**: provider pre-buys credits; each confirmed booking deducts 1 credit
    2. **Pay-per-booking** fallback: if credit < 1, require instant checkout to confirm
* **No vendor lock** in code; abstract payments behind a simple interface.

---

## Target Stack (opinionated, simple to ship)

* **Next.js 14 (App Router, TypeScript) + Tailwind**
* **Supabase (Postgres + Auth + Storage)** with **Row Level Security** on by default
* **Zod** (validation) + **React Hook Form**
* **Playwright** (E2E), **Vitest** (unit/integration)
* **Background jobs**: lightweight CRON (Vercel/Cloudflare cron or Supabase scheduled function)
* **Notifications**: Email (resend.com or Supabase SMTP) + optional **WhatsApp Cloud API** (queued)
* **Payments**: Adapter interface with concrete impl for **WiPay/FAC** later; dev uses **Mock + Cash** mode

---

## Entities (ERD v1)

```mermaid
erDiagram
  users ||--o{ providers : "owns provider profile"
  providers ||--o{ services : offers
  providers ||--o{ availability_rules : sets
  providers ||--o{ blackout_dates : sets
  services ||--o{ bookings : used_for
  customers ||--o{ bookings : places
  bookings ||--o{ payments : triggers
  providers ||--o{ wallets : has
  wallets ||--o{ wallet_ledger : records
  bookings ||--o{ notifications : creates

  users {
    uuid id PK
    text email
    text phone
    text role  // "provider" | "customer" | "admin"
    timestamptz created_at
  }

  providers {
    uuid id PK
    uuid user_id FK
    text display_name
    text handle  // vanity link
    text bio
    text currency // "JMD"
    jsonb payout_meta // optional future
    timestamptz created_at
  }

  services {
    uuid id PK
    uuid provider_id FK
    text name
    text description
    integer duration_min
    integer base_price_cents
    boolean is_active
  }

  availability_rules {
    uuid id PK
    uuid provider_id FK
    int2 dow  // 0-6
    time start_time
    time end_time
    jsonb exceptions  // optional
  }

  blackout_dates {
    uuid id PK
    uuid provider_id FK
    date day
    text reason
  }

  customers {
    uuid id PK
    text name
    text email
    text phone
  }

  bookings {
    uuid id PK
    uuid provider_id FK
    uuid service_id FK
    uuid customer_id FK
    timestamptz start_at
    timestamptz end_at
    text status // "pending","confirmed","cancelled","completed","no_show"
    text pay_mode // "credit","per_booking"
    text source // "public_link","admin"
  }

  payments {
    uuid id PK
    uuid booking_id FK
    integer amount_cents
    text currency
    text direction // "provider_fee" | "customer_fee"
    text gateway // "mock","wipay","fac"
    text status // "initiated","succeeded","failed","refunded"
    jsonb gateway_meta
    timestamptz created_at
  }

  wallets {
    uuid id PK
    uuid provider_id FK
    integer credits  // 1 credit = 1 booking
    timestamptz updated_at
  }

  wallet_ledger {
    uuid id PK
    uuid wallet_id FK
    text type // "topup","consume","adjust"
    integer delta_credits
    uuid booking_id NULL
    timestamptz created_at
  }

  notifications {
    uuid id PK
    uuid booking_id FK
    text channel // "email","whatsapp"
    text template_key
    jsonb payload
    text status // "queued","sent","error"
    timestamptz created_at
  }
```

---

## RLS (must-have)

* Providers can only read/update their **own** provider, services, availability, bookings, wallets, ledger, notifications.
* Customers can only read their **own** bookings.
* Public **create-booking** writes a row with `status='pending'` and is only updatable by the provider or system function.

*(Implement with Supabase Policies; include unit tests that attempt cross-tenant access and expect 403s.)*

---

## API Surface (Next.js route handlers)

* `POST /api/public/booking/check` → availability check (service\_id, date) → slots
* `POST /api/public/booking/create` → create pending booking (customer payload)
* `POST /api/booking/confirm` (auth: provider) → if wallet.credits>0 ⇒ consume; else create per-booking payment intent
* `POST /api/booking/cancel` (auth: provider or customer)
* `POST /api/wallet/topup` (auth: provider)
* `POST /api/payments/webhook/:gateway` (no auth; verify signature)
* `GET /api/me` (profile bootstrap)
* `GET /api/provider/:handle` (public booking page data)

All inputs **Zod** validated. Return predictable error codes/messages.

---

## Monetization Logic (v1)

* **Price:** JMD \$50–\$200 **per confirmed booking** (configurable)
* **Default flow:**

  1. Customer creates **pending** booking
  2. Provider taps **Confirm**

     * If **credits ≥ 1** → deduct 1, mark booking **confirmed**
     * Else → present paywall; succeed payment → mark **confirmed** + issue receipt
  3. Fire notifications (email + optional WhatsApp)
* Optional: **Reschedule fee** (JMD \$100) charged to **customer** on provider-requested reschedule.

---

## Notifications (templates)

* `booking_customer_pending`
* `booking_customer_confirmed`
* `booking_customer_cancelled`
* `provider_low_credits_warning`
  *(Keep copy short, JA-friendly tone. WhatsApp is queued, email is immediate.)*

---

## Environments & Secrets

```
# .env.local
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
PAYMENTS_GATEWAY="mock"  # mock | wipay | fac
PAYMENTS_WEBHOOK_SECRET=...
WHATSAPP_TOKEN=...
WHATSAPP_PHONE_ID=...
SMTP_HOST=...
SMTP_USER=...
SMTP_PASS=...
```

---

## Security & Privacy

* RLS on **all** tables; no “public” wildcard access
* Zod validation on every API route
* Audit logs via Postgres triggers (insert/update on critical tables)
* Rate-limit public endpoints (IP + provider handle)
* No secrets in client; webhooks verify signatures
* Data retention policy: purge PII on cancelled/no-show after N days (configurable)

---

## Build Plan — Step-By-Step (each step = PR with tests)

### Step 0 — Scaffold & CI

* Create Next.js (TS), Tailwind, ESLint, Prettier
* Supabase project + migrations folder
* Add Vitest + Playwright; GitHub Actions: lint, typecheck, unit, E2E (headless)
  **Acceptance:** CI green; `/healthz` returns 200 + commit SHA.

### Step 1 — Auth & Profiles

* Supabase Email OTP + phone field collection on first login
* Create `users`, `providers`, `customers` with RLS
* Provider onboarding page (display\_name, handle, currency)
  **Acceptance:** Provider can complete onboarding; RLS denies cross-tenant reads (unit tests).

### Step 2 — Services & Availability

* CRUD services; availability rules (weekly hours + blackout dates)
* Server util to compute open slots for a date range
  **Acceptance:** Given rules, `/booking/check` returns correct slots; unit tests for edge times, overlaps.

### Step 3 — Public Booking Flow (pending)

* Public provider page `/@handle` with service list + calendar
* `POST /public/booking/create` creates **pending** booking + sends email
  **Acceptance:** Customer gets pending email; provider sees the pending item in dashboard.

### Step 4 — Wallet (Credits) + Confirm

* Wallet table + ledger; “Buy credits” (mock gateway)
* `POST /booking/confirm` consumes 1 credit and marks **confirmed**
  **Acceptance:** Confirm fails when credits=0; succeeds when ≥1; ledger records “consume”.

### Step 5 — Pay-Per-Booking Fallback

* If credits < 1, create a one-off payment flow (mock)
* On webhook “succeeded”, confirm booking, emit receipt
  **Acceptance:** E2E: simulate webhook; booking transitions to **confirmed**; email sent.

### Step 6 — Reschedule/Cancel + Fees

* Reschedule workflow with optional customer fee
* Cancellation with policy (free before X hours; else no refund)
  **Acceptance:** State transitions valid; fee collected when configured; tests cover timelines.

### Step 7 — Notifications & Low-Credit Nudges

* Email templates; WhatsApp queue processor (CRON)
* Low-credit (<=2) notifications after each confirmation
  **Acceptance:** Notifications table shows queued→sent; retries on failures.

### Step 8 — Reporting Lite

* Provider dashboard: upcoming, today, this week; conversion from pending→confirmed
  **Acceptance:** Counts match SQL; E2E snapshot.

### Step 9 — Hardening

* Rate limits, input sanitization, 2FA optional
* Backups + migration rollback scripts
  **Acceptance:** Playwright checks for rate limit headers; migration down works from latest.

### Step 10 — Production Release

* Create **prod** Supabase project; run migrations
* Configure domain, env vars, webhooks; enable CRON
* Smoke test runbook
  **Acceptance:** Blue-green switch or maintenance page; SLO doc; on-call contact.

---

## Test Protocol (sample)

* **Unit**: availability math, RLS policy guards, wallet math
* **Integration**: confirm booking consumes exactly 1 credit; webhook idempotency
* **E2E (Playwright)**: customer books → provider confirms → email receipt appears (mock inbox)

---

## Example Zod Schemas (snippets)

```ts
const CreateBookingSchema = z.object({
  providerHandle: z.string().min(2),
  serviceId: z.string().uuid(),
  startAt: z.string().datetime(),
  customer: z.object({
    name: z.string().min(2),
    email: z.string().email(),
    phone: z.string().min(7).max(20)
  })
});
```

---

## Example RLS Policy Idea (pseudo-SQL)

```sql
-- Providers read only their rows
create policy "provider_owns_bookings"
on bookings for select
to authenticated
using (exists (
  select 1 from providers p
  where p.user_id = auth.uid() and p.id = bookings.provider_id
));
```

---

## Payment Adapter Interface (simplified)

```ts
export interface PaymentGateway {
  createTopupIntent(providerId: string, credits: number): Promise<{ checkoutUrl: string }>
  createPerBookingIntent(bookingId: string, amountCents: number): Promise<{ checkoutUrl: string }>
  verifyWebhook(sig: string, rawBody: string): boolean
  parseEvent(rawBody: string): { type: "payment.succeeded"|"payment.failed"; refId: string }
}
```

---

## Dev Scripts (package.json)

```json
{
  "scripts": {
    "dev": "next dev",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "e2e": "playwright test",
    "ci": "pnpm lint && pnpm typecheck && pnpm test && pnpm e2e"
  }
}
```

---

## Definition of Done (per step)

* Feature behind tests (unit+E2E)
* RLS enforced; no table left public
* Errors mapped to user-friendly toasts
* Logs include correlation IDs
* Docs updated (README + ENV + Runbook)

---

## Rollback & Recovery

* Every migration has a **down** script
* Webhooks are idempotent (dedupe by event id)
* Wallet ledger is append-only; never mutate rows

---

## Stretch (not MVP, don’t derail)

* Provider “Packages” (e.g., 10 haircuts)
* Multi-staff calendars
* Google/Apple Calendar sync
* Embedded tips and upsells

---

## Decision Heuristics

* If a choice increases complexity without clear revenue or reliability, **punt** to v2.
* Prefer predictable cash: **credits first**, then pay-per-booking fallback.

---

## What to Generate First (right now)

1. SQL migrations for all tables with minimal indexes
2. RLS policies scaffold (deny-all + selective allows)
3. `/@handle` public page (SSR) with service list + simple slot picker
4. `POST /public/booking/create` route with Zod + pending email
5. Wallet + ledger + `POST /booking/confirm` happy-path (credits)

Ship each with tests and a short README update.

---

