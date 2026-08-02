-- Run this in the Supabase SQL editor. AI Selfie Timekeeping — additive
-- only: two new tables, one new column on payroll_staff, one new private
-- storage bucket. Same conventions as every migration since 005: owner_id
-- is `text` (Prisma cuid, references public.profiles), RLS enabled with
-- service_role-only grants, access control enforced in API routes (this
-- app has no Supabase Auth session/auth.uid() to write a real RLS policy
-- against — see the standing note in migration 019).
--
-- clock_token is the public, unguessable identifier used in the
-- axla.space/c/[token] link shared with staff — deliberately NOT the
-- staff row's own uuid `id` (which appears in authenticated API responses
-- and shouldn't double as a bearer credential for the public clock-in
-- flow). Nullable during backfill, uniquely indexed once populated.
alter table public.payroll_staff add column if not exists clock_token text;
create unique index if not exists payroll_staff_clock_token_idx
  on public.payroll_staff (clock_token) where clock_token is not null;

-- One row per owner (one shop location per Payroll account, matching how
-- payroll_companies works). radius_meters is the geofence; daily_code
-- rotates once per calendar day (lazily, in code — see getOrRotateShopSettings)
-- and is written on a physical whiteboard, giving staff a second
-- "you were actually on-site" signal that a spoofed GPS reading alone
-- can't fake.
create table if not exists public.shop_settings (
  owner_id text primary key references public.profiles (id) on delete cascade,
  shop_name text not null default 'My Shop',
  lat double precision,
  lng double precision,
  radius_meters integer not null default 150,
  daily_code text,
  daily_code_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.shop_settings enable row level security;
grant select, insert, update, delete on public.shop_settings to service_role;

-- One row per clock event (in or out), richer than payroll_attendance's
-- one-row-per-staff-per-day shape — this is the audit/approval trail.
-- needs_approval is a soft flag, never a block: an out-of-geofence or
-- wrong-code clock-in still gets recorded (and still counts as a worked
-- day), it just surfaces for the owner to review. approved is nullable
-- (null = pending, true = approved, false = rejected) so the admin UI can
-- tell "never reviewed" apart from "reviewed and rejected".
create table if not exists public.timekeeping_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references public.profiles (id) on delete cascade,
  staff_id uuid not null references public.payroll_staff (id) on delete cascade,
  type text not null check (type in ('in', 'out')),
  lat double precision,
  lng double precision,
  distance_meters numeric,
  is_outside boolean not null default false,
  daily_code_match boolean not null default true,
  needs_approval boolean not null default false,
  approved boolean,
  approved_by text,
  approved_at timestamptz,
  selfie_path text,
  ip text,
  created_at timestamptz not null default now()
);

create index if not exists timekeeping_logs_owner_idx on public.timekeeping_logs (owner_id, created_at desc);
create index if not exists timekeeping_logs_staff_idx on public.timekeeping_logs (staff_id, created_at desc);

alter table public.timekeeping_logs enable row level security;
grant select, insert, update, delete on public.timekeeping_logs to service_role;

-- Private bucket for clock-in selfies — same pattern as invoice-logos:
-- signed URLs generated server-side with the service role key, no public
-- bucket URL, no storage.objects policies needed since RLS + zero policies
-- already denies anon/public access by default.
insert into storage.buckets (id, name, public)
values ('payroll-selfies', 'payroll-selfies', false)
on conflict (id) do nothing;
