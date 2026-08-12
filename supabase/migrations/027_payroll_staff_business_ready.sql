-- Staff tab refactor: payroll_staff was barbershop-shaped (name, gcash,
-- daily_rate only). Making it general-business-ready — additive only,
-- nothing existing renamed or dropped, so the 4 real staff rows already in
-- FADE REPUBLIC BARBERSHOP keep working unmodified. Same conventions as
-- every migration since 005 (owner_id text, RLS enabled with
-- service_role-only grants, access control enforced in API routes).
--
-- `daily_rate` is deliberately kept, not replaced — the Payroll Run engine
-- (lib/payroll/sahod.ts, api/payroll/runs/compute) still only knows how to
-- compute daily-rate x days-present. `rate_amount`/`rate_type` are the new
-- descriptive fields shown in the Staff tab; for rate_type='daily' the API
-- keeps daily_rate in sync with rate_amount so existing payroll runs are
-- unaffected. Hourly/monthly staff display correctly here, but actually
-- computing a run for them isn't wired into the engine yet (out of scope
-- for this refactor — the Run/Reports/Payslip tabs weren't touched).
alter table public.payroll_staff add column if not exists employment_type text not null default 'Regular';
alter table public.payroll_staff add column if not exists rate_type text not null default 'daily' check (rate_type in ('daily', 'hourly', 'monthly'));
alter table public.payroll_staff add column if not exists rate_amount numeric;
alter table public.payroll_staff add column if not exists phone text;
alter table public.payroll_staff add column if not exists schedule text;
alter table public.payroll_staff add column if not exists status text not null default 'Active' check (status in ('Active', 'On Leave', 'Inactive'));
alter table public.payroll_staff add column if not exists hired_at date;
alter table public.payroll_staff add column if not exists avatar_url text;
alter table public.payroll_staff add column if not exists address text;

-- Government tab fields (BIR/SSS/PhilHealth/Pag-IBIG numbers) — free text,
-- not validated/checksummed here (matches how `tin` is stored unvalidated
-- on payroll_companies).
alter table public.payroll_staff add column if not exists sss_no text;
alter table public.payroll_staff add column if not exists philhealth_no text;
alter table public.payroll_staff add column if not exists pagibig_no text;
alter table public.payroll_staff add column if not exists tin_no text;

-- Payroll tab fields beyond rate.
alter table public.payroll_staff add column if not exists bank_name text;
alter table public.payroll_staff add column if not exists bank_account_no text;
alter table public.payroll_staff add column if not exists commission_pct numeric;

-- Backfill: every existing row's real daily_rate becomes its rate_amount,
-- rate_type stays the 'daily' default set above — no existing staff row's
-- displayed rate changes.
update public.payroll_staff set rate_amount = daily_rate where rate_amount is null;

-- Cash Advance tracking — one row per advance, staff-scoped. `status`
-- 'deducted' means it was applied against a finalized payroll run (manual
-- bookkeeping for now, not auto-linked to payroll_runs.breakdown — Phase 1
-- scope is recording advances, not netting them against Payroll Run).
create table if not exists public.payroll_cash_advances (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.payroll_staff (id) on delete cascade,
  owner_id text not null references public.profiles (id) on delete cascade,
  amount numeric not null check (amount > 0),
  reason text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'deducted')),
  created_at timestamptz not null default now()
);

create index if not exists payroll_cash_advances_staff_idx on public.payroll_cash_advances (staff_id, created_at desc);
create index if not exists payroll_cash_advances_owner_idx on public.payroll_cash_advances (owner_id, created_at desc);

alter table public.payroll_cash_advances enable row level security;
grant select, insert, update, delete on public.payroll_cash_advances to service_role;

-- Staff Documents — file_path is the raw private-bucket storage path (never
-- a URL), same signed-URL-at-read-time pattern as payroll_companies.logo_url.
create table if not exists public.payroll_staff_documents (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.payroll_staff (id) on delete cascade,
  owner_id text not null references public.profiles (id) on delete cascade,
  name text not null,
  file_path text not null,
  file_type text,
  created_at timestamptz not null default now()
);

create index if not exists payroll_staff_documents_staff_idx on public.payroll_staff_documents (staff_id, created_at desc);

alter table public.payroll_staff_documents enable row level security;
grant select, insert, update, delete on public.payroll_staff_documents to service_role;

insert into storage.buckets (id, name, public)
values ('payroll-staff-docs', 'payroll-staff-docs', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('payroll-staff-avatars', 'payroll-staff-avatars', false)
on conflict (id) do nothing;
