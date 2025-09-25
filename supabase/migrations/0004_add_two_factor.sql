-- Add two-factor authentication fields to users
alter table public.users
  add column if not exists two_factor_secret text,
  add column if not exists two_factor_enabled boolean not null default false;

comment on column public.users.two_factor_secret is 'Base32 encoded secret for TOTP verification';
comment on column public.users.two_factor_enabled is 'Flag indicating if two-factor verification is required at sign-in';
