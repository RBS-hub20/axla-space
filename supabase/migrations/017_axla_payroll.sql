-- Run this in the Supabase SQL editor. Axla Payroll — additive only, four
-- new tables plus one new nullable column on the existing `payments` table.
-- Nothing existing altered. Same conventions as every migration since 005:
-- owner_id/user_id are `text` (Prisma cuid, referencing public.profiles),
-- RLS enabled with service_role-only grants, access control enforced in
-- API routes.
--
-- Deliberately its own `payroll_subscriptions` table, NOT a row in the
-- existing `subscriptions` table — that table's plan check constraint only
-- allows ('free','pro','business') and is the single source of truth every
-- TaxLaya paywall reads via getUserPlan()/getActivePaidPlan(). Reusing it
-- for a second, unrelated product's plan tiers (starter/business/enterprise)
-- would either violate that constraint or silently grant TaxLaya Pro/
-- Business access to a Payroll-only buyer. Same reasoning is why Payroll's
-- checkout (src/app/api/payroll/checkout) never sends PayMongo a billing
-- email and is confirmed via a direct status check rather than the shared
-- /api/webhooks/paymongo handler — that handler's derivePlan() would match
-- the literal word "business" in a Payroll "Business" tier purchase and
-- misfile it as a real TaxLaya Business subscription.

create table if not exists public.payroll_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique references public.profiles (id) on delete cascade,
  email text not null,
  plan text not null check (plan in ('starter', 'business', 'enterprise')),
  status text not null default 'active' check (status in ('active', 'past_due', 'paused', 'canceled')),
  price integer not null default 0,
  product text not null default 'axla_payroll',
  next_billing timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists payroll_subscriptions_email_idx on public.payroll_subscriptions (email);

alter table public.payroll_subscriptions enable row level security;
grant select, insert, update, delete on public.payroll_subscriptions to service_role;

create table if not exists public.payroll_staff (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references public.profiles (id) on delete cascade,
  name text not null,
  gcash text,
  daily_rate numeric not null default 479,
  created_at timestamptz not null default now()
);

create index if not exists payroll_staff_owner_idx on public.payroll_staff (owner_id, created_at desc);

alter table public.payroll_staff enable row level security;
grant select, insert, update, delete on public.payroll_staff to service_role;

-- selfie_url is nullable and unused in Phase 1 (mock timekeeping — a real
-- capture/upload flow isn't built yet), kept so the column doesn't need
-- adding later when it is.
create table if not exists public.payroll_attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.payroll_staff (id) on delete cascade,
  date date not null,
  time_in timestamptz,
  time_out timestamptz,
  selfie_url text,
  created_at timestamptz not null default now(),
  unique (staff_id, date)
);

create index if not exists payroll_attendance_staff_idx on public.payroll_attendance (staff_id, date desc);

alter table public.payroll_attendance enable row level security;
grant select, insert, update, delete on public.payroll_attendance to service_role;

-- breakdown stores the per-staff computed rows (name, days present, basic
-- pay) as a snapshot at the moment the run was computed — total_sahod alone
-- can't reconstruct what changed if staff/rates change after the fact.
create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references public.profiles (id) on delete cascade,
  month text not null,
  total_sahod numeric not null default 0,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  breakdown jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payroll_runs_owner_idx on public.payroll_runs (owner_id, created_at desc);

alter table public.payroll_runs enable row level security;
grant select, insert, update, delete on public.payroll_runs to service_role;

-- Tags which product a payments-ledger row belongs to. Existing rows (every
-- TaxLaya Pro/Business webhook activation to date) are left null, which by
-- convention means "axla_taxlaya" — nothing existing needs backfilling for
-- current admin queries to keep working, since none of them filter on this
-- column yet.
alter table public.payments add column if not exists product text;
