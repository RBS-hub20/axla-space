-- Run this in the Supabase SQL editor. BIR Guard [BETA] — additive only,
-- two new tables, nothing existing altered.
--
-- Deliberately NOT the originally-specified bir_credentials table (would
-- have stored users' actual mytax.bir.gov.ph login/password, encrypted or
-- not) and NOT a bot/scraper — storing real government tax-portal
-- credentials in our own DB is a severe liability if ever compromised, and
-- automating login against BIR's portal likely violates their terms of
-- service. This is the manual-entry version: users log into BIR themselves
-- and record what they see: existing open cases/penalties, plus their own
-- screenshot if they want one attached. No credentials ever touch this app.
--
-- Same conventions as every migration since 005: user_id is `text` (Prisma
-- cuid, NOT a Supabase auth.users uuid — this app has no Supabase Auth
-- session at all, see the standing note above `profiles` in schema.sql),
-- RLS enabled with service_role-only grants, access control enforced in
-- API routes.

create table if not exists public.bir_open_cases (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles (id) on delete cascade,
  form_type text not null,
  tax_period text not null,
  status text not null default 'open' check (status in ('open', 'penalty', 'filed')),
  penalty_amount numeric not null default 0,
  due_date date,
  notes text,
  screenshot_url text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists bir_open_cases_user_idx on public.bir_open_cases (user_id, created_at desc);

alter table public.bir_open_cases enable row level security;
grant select, insert, update, delete on public.bir_open_cases to service_role;

-- Activity log for BIR Guard actions (case added/updated/resolved) — kept
-- the name `bir_sync_logs` from the original spec even though there's no
-- automated sync in this version, to avoid a second rename; `status` here
-- means whether the logged action succeeded, not a "sync" outcome.
create table if not exists public.bir_sync_logs (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('success', 'error')),
  error_message text,
  duration_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists bir_sync_logs_user_idx on public.bir_sync_logs (user_id, created_at desc);

alter table public.bir_sync_logs enable row level security;
grant select, insert, update, delete on public.bir_sync_logs to service_role;
