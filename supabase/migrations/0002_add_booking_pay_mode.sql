alter table public.bookings
  add column if not exists pay_mode text check (pay_mode in ('credit','per_booking'));
