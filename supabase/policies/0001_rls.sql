-- Enable row level security
alter table public.providers enable row level security;
alter table public.services enable row level security;
alter table public.availability_rules enable row level security;
alter table public.blackout_dates enable row level security;
alter table public.bookings enable row level security;
alter table public.wallets enable row level security;
alter table public.wallet_ledger enable row level security;
alter table public.notifications enable row level security;

-- Deny all by default
create policy providers_deny_all on public.providers for all using (false);
create policy services_deny_all on public.services for all using (false);
create policy availability_rules_deny_all on public.availability_rules for all using (false);
create policy blackout_dates_deny_all on public.blackout_dates for all using (false);
create policy bookings_deny_all on public.bookings for all using (false);
create policy wallets_deny_all on public.wallets for all using (false);
create policy wallet_ledger_deny_all on public.wallet_ledger for all using (false);
create policy notifications_deny_all on public.notifications for all using (false);

-- Providers read/update their resources
create policy providers_owner_access
  on public.providers
  for select using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy services_owner_access
  on public.services
  for all using (
    exists(select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid())
  ) with check (
    exists(select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid())
  );

create policy availability_owner_access
  on public.availability_rules
  for all using (
    exists(select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid())
  ) with check (
    exists(select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid())
  );

create policy blackout_owner_access
  on public.blackout_dates
  for all using (
    exists(select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid())
  ) with check (
    exists(select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid())
  );

create policy bookings_provider_access
  on public.bookings
  for select using (
    exists(select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid())
  );

create policy bookings_provider_modify
  on public.bookings
  for update using (
    exists(select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid())
  ) with check (
    exists(select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid())
  );

create policy wallets_provider_access
  on public.wallets
  for select using (
    exists(select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid())
  );

create policy wallets_provider_update
  on public.wallets
  for update using (
    exists(select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid())
  ) with check (
    exists(select 1 from public.providers p where p.id = provider_id and p.user_id = auth.uid())
  );

create policy wallet_ledger_provider_access
  on public.wallet_ledger
  for select using (
    exists(select 1 from public.wallets w join public.providers p on w.provider_id = p.id where w.id = wallet_id and p.user_id = auth.uid())
  );

create policy notifications_provider_access
  on public.notifications
  for select using (
    exists(select 1 from public.bookings b join public.providers p on b.provider_id = p.id where b.id = booking_id and p.user_id = auth.uid())
  );

-- Public booking page read access
create policy providers_public_read
  on public.providers
  for select using (true);

create policy services_public_read
  on public.services
  for select using (is_active is true);

create policy availability_public_read
  on public.availability_rules
  for select using (true);

create policy blackout_public_read
  on public.blackout_dates
  for select using (true);
