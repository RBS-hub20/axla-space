-- CRITICAL SECURITY FIX — re-assert Row Level Security across every table
-- this project has ever created, in response to Supabase's "Table publicly
-- accessible — RLS not enabled" advisor emails (Aug 17 & 23, 2026).
--
-- SCOPE NOTE, read this first: this migration only covers the Supabase
-- project backing THIS repo (axla-space — Axla Payroll + the original
-- TaxLaya/waitlist app share one project and one database; "axla-waitlist"
-- in the advisor email is that same project, not a separate one — this repo
-- has always had its own `public.waitlist` table, see migration 001).
-- `egov-superagent-mvp` (etcfwimpirfcltzpnbwj) is a DIFFERENT Supabase
-- project belonging to a different codebase this session has no access to —
-- I cannot see its schema or table names, so I have not written policies
-- for it here. Run the same two steps below directly in ITS Supabase SQL
-- editor: (1) `select tablename from pg_tables where schemaname='public' and
-- rowsecurity=false;` to find what's exposed, (2) `alter table <name>
-- enable row level security;` for each one. Do not paste this file's table
-- names into that project — none of them exist there.
--
-- Also correcting the table names in the original report against what
-- actually exists in this codebase — several were guessed and don't match:
--   payroll_payslips    -> doesn't exist; payroll_runs.breakdown (jsonb) holds this
--   payroll_timekeeping  -> doesn't exist; the real tables are timekeeping_logs
--                           and payroll_attendance
--   payroll_advances     -> doesn't exist; the real table is payroll_cash_advances
--   payroll_payouts      -> doesn't exist
--   payroll_settings     -> doesn't exist; the real table is shop_settings
--   companies            -> doesn't exist; the real table is payroll_companies
--
-- Every one of the 34 real tables below already had an `enable row level
-- security` statement written in its own migration or in schema.sql from
-- day one (verified by reading every migration file) — the way a table
-- ends up with rowsecurity=false in production despite that is (a) that
-- migration never actually ran against the live database, or (b) RLS was
-- toggled off by hand in the Supabase dashboard (e.g. while debugging) and
-- never turned back on. `enable row level security` is idempotent and safe
-- to re-run on a table where it's already on, so this migration simply
-- re-asserts it everywhere, closing either gap regardless of which one
-- caused it — and `alter table if exists` means it's also a harmless no-op
-- for any table name below that, for whatever reason, was never created.
--
-- Deliberately NOT adding "FOR ALL USING (auth.role() = 'authenticated')"
-- policies to the business/data tables, even though that was the literal
-- ask — this app has NO Supabase Auth session anywhere (custom Prisma/JWT
-- login instead, see the standing note at the top of the `profiles` table
-- in schema.sql: "there is no Supabase auth.uid() for these tables to key
-- off... Do not add anon/public policies to these tables"). auth.role() =
-- 'authenticated' would never be true for this app's real traffic today,
-- so it wouldn't fix anything the existing deny-everyone-but-service_role
-- pattern doesn't already fix — but it WOULD sit there as a live landmine:
-- the moment anyone adds real Supabase Auth later, that policy instantly
-- grants every logged-in user full read/write/delete on every OTHER
-- tenant's payroll, invoices, and tax data, with no per-row ownership
-- check at all. Every dashboard/payroll API route already runs entirely
-- through supabaseAdmin (the service_role key, which bypasses RLS
-- regardless of policies) and filters by owner_id/user_id in the query
-- itself — that app-layer filter is the real access-control boundary here,
-- exactly as this codebase's own schema.sql already documents. Enabling
-- RLS with zero policies is what makes the anon key (NEXT_PUBLIC_
-- SUPABASE_ANON_KEY — public by design, sitting in the browser bundle for
-- anyone to read) unable to see or touch a single row via the Supabase
-- REST API, which is the actual vulnerability the advisor is warning
-- about — nothing in this app's own code uses that anon key for real
-- queries (confirmed: src/lib/supabase/client.ts is never imported
-- anywhere except a stray comment), so this closes the hole with zero risk
-- to existing functionality, including the FADE REPUBLIC BARBERSHOP
-- payroll data (4 staff, the ₱49,816 run, etc.) which is only ever read
-- through supabaseAdmin server-side.

alter table if exists public.activities enable row level security;
alter table if exists public.bir_filings enable row level security;
alter table if exists public.bir_forms enable row level security;
alter table if exists public.bir_loa_cases enable row level security;
alter table if exists public.bir_open_cases enable row level security;
alter table if exists public.bir_rdo_transfers enable row level security;
alter table if exists public.bir_sync_logs enable row level security;
alter table if exists public.business_registrations enable row level security;
alter table if exists public.chat_messages enable row level security;
alter table if exists public.chat_rate_limits enable row level security;
alter table if exists public.invoice_settings enable row level security;
alter table if exists public.invoices enable row level security;
alter table if exists public.payments enable row level security;
alter table if exists public.payroll_attendance enable row level security;
alter table if exists public.payroll_audit_logs enable row level security;
alter table if exists public.payroll_cash_advances enable row level security;
alter table if exists public.payroll_companies enable row level security;
alter table if exists public.payroll_runs enable row level security;
alter table if exists public.payroll_staff enable row level security;
alter table if exists public.payroll_staff_documents enable row level security;
alter table if exists public.payroll_subscriptions enable row level security;
alter table if exists public.profiles enable row level security;
alter table if exists public.receipts enable row level security;
alter table if exists public.referral_clicks enable row level security;
alter table if exists public.shop_settings enable row level security;
alter table if exists public.subscriptions enable row level security;
alter table if exists public.tax_calculations enable row level security;
alter table if exists public.taxlaya_chats enable row level security;
alter table if exists public.team_invites enable row level security;
alter table if exists public.team_members enable row level security;
alter table if exists public.timekeeping_logs enable row level security;
alter table if exists public.transactions enable row level security;
alter table if exists public.usage_counters enable row level security;
alter table if exists public.waitlist enable row level security;

-- `waitlist` is the one genuinely public-facing table (a landing-page
-- signup form, not tenant-owned business data), so the requested
-- public-insert / authenticated-read shape actually fits it — a random
-- visitor should be able to join the waitlist, nobody but this app's own
-- admin surface should be able to read the list back out. The app's own
-- /api/waitlist route already writes through supabaseAdmin (service_role,
-- unaffected by either policy below); these exist so the anon key
-- specifically can insert but never select.
drop policy if exists "Allow public insert" on public.waitlist;
create policy "Allow public insert" on public.waitlist
  for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Allow authenticated read" on public.waitlist;
create policy "Allow authenticated read" on public.waitlist
  for select
  to authenticated
  using (auth.role() = 'authenticated');
