-- Run this in the Supabase SQL editor. Adds click-tracking storage for the
-- admin "Referral Link" feature (Admin v2). Same conventions as every
-- migration since 005: RLS enabled, service_role-only grants (no Supabase
-- Auth session exists in this app), access control enforced in API routes.
--
-- ref_email is nullable: a ref token that doesn't decode to a valid email
-- (tampered/garbage query param) is still logged via raw_ref for visibility,
-- but never trusted as an identity.

create table if not exists public.referral_clicks (
  id uuid primary key default gen_random_uuid(),
  ref_email text,
  raw_ref text not null,
  created_at timestamptz not null default now()
);

create index if not exists referral_clicks_ref_email_idx on public.referral_clicks (ref_email);

alter table public.referral_clicks enable row level security;
grant select, insert, update, delete on public.referral_clicks to service_role;
