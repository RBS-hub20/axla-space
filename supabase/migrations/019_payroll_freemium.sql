-- Run this in the Supabase SQL editor. Axla Payroll freemium — additive
-- only: one new table (payroll_companies) plus a few nullable columns on
-- the existing payroll_* tables from migration 017. All four payroll_*
-- tables have zero rows in production as of this migration, so no data
-- migration is needed for the new columns.
--
-- owner_id is `text` referencing public.profiles(id) — same convention as
-- every other table in this schema (Prisma cuid, not a Supabase auth.users
-- uuid; this app has no Supabase Auth session at all, see the standing
-- note above `profiles` in schema.sql). RLS enabled with service_role-only
-- grants; actual access control is enforced in API routes via the session
-- cookie (src/lib/session.ts), same as everywhere else — there is no
-- auth.uid() for a Postgres RLS policy to compare against here.

create table if not exists public.payroll_companies (
  owner_id text primary key references public.profiles (id) on delete cascade,
  business_name text not null,
  rdo_code text,
  min_wage numeric not null default 479,
  tin text,
  created_at timestamptz not null default now()
);

alter table public.payroll_companies enable row level security;
grant select, insert, update, delete on public.payroll_companies to service_role;

alter table public.payroll_staff add column if not exists position text;
alter table public.payroll_staff add column if not exists branch text;

alter table public.payroll_attendance add column if not exists hours numeric;

alter table public.payroll_runs add column if not exists cut_off text;
alter table public.payroll_runs add column if not exists staff_count integer;
