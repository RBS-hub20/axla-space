-- Run this in the Supabase SQL editor. BIR Guard v2 — additive only.
--
-- Adds:
--  1. tax_due_amount on bir_open_cases, so the penalty breakdown (surcharge,
--     interest, compromise) can be recomputed live from today's date instead
--     of freezing a manually-typed penalty figure at creation time.
--  2. bir_loa_cases — LOA (Letter of Authority) tracker, BUSINESS plan only.
--  3. bir_rdo_transfers — one active RDO-transfer draft per user (From RDO,
--     To RDO, 1905 checklist), BUSINESS plan only.
--
-- Same conventions as migration 011: user_id is `text` (Prisma cuid, not a
-- Supabase auth.users uuid), RLS enabled with service_role-only grants,
-- access control enforced in API routes.

alter table public.bir_open_cases
  add column if not exists tax_due_amount numeric not null default 0;

create table if not exists public.bir_loa_cases (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles (id) on delete cascade,
  loa_no text not null,
  rdo text not null,
  received_date date not null,
  deadline date not null,
  status text not null default 'open' check (status in ('open', 'submitted', 'closed')),
  created_at timestamptz not null default now()
);

create index if not exists bir_loa_cases_user_idx on public.bir_loa_cases (user_id, created_at desc);

alter table public.bir_loa_cases enable row level security;
grant select, insert, update, delete on public.bir_loa_cases to service_role;

create table if not exists public.bir_rdo_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique references public.profiles (id) on delete cascade,
  from_rdo text not null default '',
  to_rdo text not null default '',
  checklist jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.bir_rdo_transfers enable row level security;
grant select, insert, update, delete on public.bir_rdo_transfers to service_role;
