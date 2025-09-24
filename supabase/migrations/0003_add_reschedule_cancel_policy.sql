alter table public.providers
  add column if not exists reschedule_fee_cents integer not null default 0,
  add column if not exists late_cancel_hours integer not null default 12;
