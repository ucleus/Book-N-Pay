-- Roll back two-factor authentication fields
alter table public.users
  drop column if exists two_factor_secret,
  drop column if exists two_factor_enabled;
