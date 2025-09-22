-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Users table
create table if not exists public.users (
  id uuid primary key default uuid_generate_v4(),
  email text unique not null,
  phone text,
  role text not null check (role in ('provider','customer','admin')),
  created_at timestamptz not null default now()
);

-- Providers
create table if not exists public.providers (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references public.users(id) on delete cascade,
  display_name text not null,
  handle text not null unique,
  bio text,
  currency text not null default 'JMD',
  payout_meta jsonb,
  created_at timestamptz not null default now()
);

create index if not exists providers_user_id_idx on public.providers(user_id);

-- Services
create table if not exists public.services (
  id uuid primary key default uuid_generate_v4(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  name text not null,
  description text,
  duration_min integer not null check (duration_min > 0),
  base_price_cents integer not null check (base_price_cents >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists services_provider_id_idx on public.services(provider_id);

-- Availability rules
create table if not exists public.availability_rules (
  id uuid primary key default uuid_generate_v4(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  dow smallint not null check (dow between 0 and 6),
  start_time time not null,
  end_time time not null,
  exceptions jsonb,
  created_at timestamptz not null default now()
);

create index if not exists availability_rules_provider_id_idx on public.availability_rules(provider_id);

-- Blackout dates
create table if not exists public.blackout_dates (
  id uuid primary key default uuid_generate_v4(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  day date not null,
  reason text,
  created_at timestamptz not null default now(),
  unique(provider_id, day)
);

-- Customers
create table if not exists public.customers (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  email text unique not null,
  phone text,
  created_at timestamptz not null default now()
);

-- Bookings
create table if not exists public.bookings (
  id uuid primary key default uuid_generate_v4(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null check (status in ('pending','confirmed','cancelled','completed','no_show')) default 'pending',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bookings_provider_id_idx on public.bookings(provider_id);
create index if not exists bookings_customer_id_idx on public.bookings(customer_id);
create index if not exists bookings_start_at_idx on public.bookings(start_at);

-- Payments
create table if not exists public.payments (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid references public.bookings(id) on delete set null,
  provider_id uuid not null references public.providers(id) on delete cascade,
  status text not null check (status in ('initiated','succeeded','failed','refunded')),
  amount_cents integer not null check (amount_cents >= 0),
  gateway text not null,
  gateway_ref text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payments_booking_id_idx on public.payments(booking_id);
create index if not exists payments_provider_id_idx on public.payments(provider_id);

-- Wallets
create table if not exists public.wallets (
  id uuid primary key default uuid_generate_v4(),
  provider_id uuid not null references public.providers(id) on delete cascade,
  balance_credits integer not null default 0,
  currency text not null default 'JMD',
  created_at timestamptz not null default now(),
  unique(provider_id)
);

-- Wallet ledger
create table if not exists public.wallet_ledger (
  id uuid primary key default uuid_generate_v4(),
  wallet_id uuid not null references public.wallets(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  change_credits integer not null,
  description text not null,
  created_at timestamptz not null default now()
);

create index if not exists wallet_ledger_wallet_id_idx on public.wallet_ledger(wallet_id);

-- Notifications
create table if not exists public.notifications (
  id uuid primary key default uuid_generate_v4(),
  booking_id uuid references public.bookings(id) on delete cascade,
  channel text not null check (channel in ('email','whatsapp')),
  recipient text not null,
  payload jsonb not null,
  status text not null check (status in ('pending','sent','failed')) default 'pending',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);

create index if not exists notifications_booking_id_idx on public.notifications(booking_id);

-- Audit helpers
create table if not exists public.webhook_events (
  id uuid primary key default uuid_generate_v4(),
  gateway text not null,
  external_id text not null,
  payload jsonb not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(gateway, external_id)
);
