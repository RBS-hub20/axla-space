-- Run this in the Supabase SQL editor. Payment-proof audit trail — additive
-- only, one new table. Same conventions as every migration since 005:
-- owner_id/employee_id are text/uuid referencing existing tables, RLS
-- enabled with service_role-only grants (no Supabase Auth session in this
-- app — see the standing note in migration 019/020).
--
-- Fixes security audit finding #2 (payment-proof integrity): every mutation
-- to a payroll_runs.payment_proofs entry (mark paid, employee confirm,
-- owner override) now writes one row here, capturing what changed and why,
-- instead of the previous state simply being overwritten with no history.
create table if not exists public.payroll_audit_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references public.profiles (id) on delete cascade,
  employee_id uuid not null references public.payroll_staff (id) on delete cascade,
  payroll_run_id uuid not null references public.payroll_runs (id) on delete cascade,
  action text not null check (action in ('mark_paid', 'confirm', 'override')),
  old_value jsonb,
  new_value jsonb not null,
  reason text,
  ip text,
  created_at timestamptz not null default now()
);

create index if not exists payroll_audit_logs_run_idx on public.payroll_audit_logs (payroll_run_id, created_at desc);
create index if not exists payroll_audit_logs_owner_idx on public.payroll_audit_logs (owner_id, created_at desc);

alter table public.payroll_audit_logs enable row level security;
grant select, insert, update, delete on public.payroll_audit_logs to service_role;
