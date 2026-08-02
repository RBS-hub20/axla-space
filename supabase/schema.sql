-- Run this in the Supabase SQL editor (Project -> SQL Editor -> New query)
-- to set up the waitlist table used by the landing page + admin dashboard,
-- and the rate-limit table used by TaxLaya chat.

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  bir_hate_level int8 not null check (bir_hate_level between 1 and 10),
  created_at timestamptz not null default now()
);

alter table public.waitlist enable row level security;

-- Allow anyone (using the anon/public key) to insert a row, but never read,
-- update, or delete — so the anon key used by the landing page can only
-- add signups, not list or tamper with existing ones. The admin dashboard
-- reads/writes with the service role key instead, which bypasses RLS.
create policy "Allow public insert" on public.waitlist
  for insert
  to anon
  with check (true);

-- Defensive alters: the admin waitlist-approval dashboard and the send-otp
-- login gate need name/business_name/status on top of the original
-- hate-level columns above. Safe to re-run; existing rows default to
-- 'pending' (not approved) since none have gone through admin-approve yet.
alter table public.waitlist add column if not exists name text;
alter table public.waitlist add column if not exists business_name text;
alter table public.waitlist add column if not exists status text not null default 'pending';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'waitlist_status_check'
  ) then
    alter table public.waitlist
      add constraint waitlist_status_check check (status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

-- Rate limiting for TaxLaya chat (/api/chat): 10 messages per IP per day.
-- No public policies: only the service_role key (used server-only in
-- /api/chat) can read or write this table; RLS blocks everyone else.
create table if not exists public.chat_rate_limits (
  ip text not null,
  day date not null default current_date,
  count int not null default 0,
  primary key (ip, day)
);

alter table public.chat_rate_limits enable row level security;

-- RLS with zero policies still blocks service_role unless it also holds the
-- underlying table-level GRANT (see the matching comment on
-- subscriptions/payments below) — idempotent, safe to re-run.
grant select, insert, update, delete on public.chat_rate_limits to service_role;

-- Atomically increments today's count for an IP and returns the new total,
-- so concurrent requests from the same IP can't race past the limit.
create or replace function public.increment_chat_rate_limit(p_ip text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_count int;
begin
  insert into public.chat_rate_limits (ip, day, count)
  values (p_ip, current_date, 1)
  on conflict (ip, day)
  do update set count = chat_rate_limits.count + 1
  returning count into new_count;

  return new_count;
end;
$$;

-- Logs each user message sent to TaxLaya (question text only, no assistant
-- replies) so the admin dashboard can show message volume, top questions,
-- most-asked BIR forms, and a recent-activity feed. No public policies:
-- only the service_role key (server-only, in /api/chat and /api/admin/chat)
-- can read or write this table.
create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  ip text not null,
  message text not null,
  created_at timestamptz not null default now()
);

alter table public.chat_messages enable row level security;

grant select, insert, update, delete on public.chat_messages to service_role;

create index if not exists chat_messages_created_at_idx
  on public.chat_messages (created_at desc);

-- ============================================================================
-- TaxLaya client dashboard (profiles, tax_calculations, bir_forms, receipts,
-- activities).
--
-- IMPORTANT: this app does NOT use Supabase Auth. Sign-in is a custom
-- Prisma-backed OTP flow (see prisma/schema.prisma `User`, src/lib/jwt.ts) —
-- there is no Supabase `auth.users` row and no `auth.uid()` for these tables
-- to key off. `user_id` below is the Prisma `User.id` (a `cuid()` string),
-- passed in from the verified session cookie server-side.
--
-- Because there's no Supabase Auth session for PostgREST to check, RLS here
-- is intentionally "service_role only, deny everyone else" — the exact same
-- pattern as chat_rate_limits/chat_messages above. Every dashboard API route
-- runs server-side with supabaseAdmin (service role, bypasses RLS regardless
-- of whether RLS is even enabled) and always filters
-- `where user_id = <session user's id>` in the query itself. That app-layer
-- filter, not RLS, is what keeps one user from reading another user's data.
-- Do not add anon/public policies to these tables.
-- ============================================================================

create table if not exists public.profiles (
  id text primary key, -- Prisma User.id
  email text not null,
  full_name text,
  business_name text,
  tin_number text,
  address text,
  tax_type text not null default '8%' check (tax_type in ('8%', '3%', 'itemized')),
  rdo_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Defensive alters: safe to re-run even if `profiles` already existed from
-- an earlier version of this schema without these columns.
alter table public.profiles add column if not exists business_name text;
alter table public.profiles add column if not exists tin_number text;
alter table public.profiles add column if not exists address text;

-- Lets a non-founder account be granted admin access (in addition to the
-- hardcoded founder email checked in src/lib/admin.ts) without a schema
-- change later. Defaults to 'user' for everyone existing.
alter table public.profiles add column if not exists role text not null default 'user';

alter table public.profiles enable row level security;

create table if not exists public.tax_calculations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  income numeric not null,
  expenses numeric not null default 0,
  tax_type text not null check (tax_type in ('8%', '3%', 'itemized')),
  quarter int not null check (quarter between 1 and 4),
  year int not null,
  tax_due numeric not null,
  surcharge numeric not null default 0,
  interest numeric not null default 0,
  is_late boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.tax_calculations enable row level security;

create index if not exists tax_calculations_user_id_idx
  on public.tax_calculations (user_id, created_at desc);

create table if not exists public.bir_forms (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  form_type text not null check (form_type in ('2551Q', '1701Q', '0619E')),
  status text not null default 'draft' check (status in ('draft', 'filed')),
  data jsonb not null default '{}'::jsonb,
  calculation_id uuid references public.tax_calculations (id) on delete set null,
  filed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.bir_forms enable row level security;

create index if not exists bir_forms_user_id_idx
  on public.bir_forms (user_id, created_at desc);

create table if not exists public.receipts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  file_path text not null, -- path within the `receipts` storage bucket
  amount numeric,
  vendor text,
  category text check (category in ('deductible', 'non_deductible', 'uncategorized')),
  receipt_date date,
  ocr_data jsonb,
  created_at timestamptz not null default now()
);

alter table public.receipts enable row level security;

create index if not exists receipts_user_id_idx
  on public.receipts (user_id, created_at desc);

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  action text not null,
  description text not null,
  created_at timestamptz not null default now()
);

alter table public.activities enable row level security;

create index if not exists activities_user_id_idx
  on public.activities (user_id, created_at desc);

-- Storage bucket for receipt images/PDFs. Private (not public) — the
-- dashboard reads files back via short-lived signed URLs generated
-- server-side with the service role key, never a public bucket URL.
insert into storage.buckets (id, name, public)
values ('receipts', 'receipts', false)
on conflict (id) do nothing;

-- No storage.objects policies are added for the `receipts` bucket: with RLS
-- enabled and zero policies, only the service_role key (used server-only in
-- src/app/api/dashboard/receipts/route.ts) can read/write it. Anon/public
-- requests are denied by default.

-- ============================================================================
-- Payments & subscriptions (PayMongo/Xendit) — powers the admin Revenue KPIs,
-- revenue chart, and recent-payments feed. Same "service_role only" RLS
-- pattern as everything above: no Supabase Auth session exists here, so
-- there's no auth.uid() to write a real "users can read own" policy against.
-- Access control is enforced in the API routes instead. See
-- supabase/migrations/005_payments_subscriptions.sql for the full rationale
-- (including why user_id is `text`, not `uuid`, and the extra
-- `payment_method` column beyond the original spec).
-- ============================================================================

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  user_id text references public.profiles (id) on delete set null,
  plan text not null default 'free' check (plan in ('free', 'pro', 'business', 'payroll_starter', 'payroll_business', 'payroll_enterprise')),
  status text not null default 'trial' check (status in ('trial', 'active', 'past_due', 'canceled')),
  amount integer not null default 0,
  provider text check (provider in ('paymongo', 'xendit')),
  billing_cycle text check (billing_cycle in ('monthly', 'yearly')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);
create index if not exists subscriptions_status_idx on public.subscriptions (status);

alter table public.subscriptions enable row level security;

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  user_id text,
  amount integer not null default 0,
  currency text not null default 'PHP',
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed')),
  provider text check (provider in ('paymongo', 'xendit')),
  provider_payment_id text,
  payment_method text,
  plan text,
  product text,
  created_at timestamptz not null default now()
);

create index if not exists payments_email_idx on public.payments (email);
create index if not exists payments_created_at_idx on public.payments (created_at desc);

alter table public.payments enable row level security;

-- RLS with zero policies still blocks service_role unless it also holds the
-- underlying table-level GRANT — see the matching comment in
-- supabase/migrations/005_payments_subscriptions.sql. Explicit and
-- idempotent, safe to re-run.
grant select, insert, update, delete on public.subscriptions to service_role;
grant select, insert, update, delete on public.payments to service_role;
-- Run this in the Supabase SQL editor. Adds free-tier usage metering
-- (filings/quarter, scans/month, AI chats/day) for the upgrade-wall system.
--
-- Deviations from the literal spec, both required for correctness:
--   1. `user_id` is `text`, not `uuid` — same reason as subscriptions/payments
--      (migration 005): profiles.id is the Prisma cuid() string, not a real
--      Postgres uuid.
--   2. One row per user (not one row per user per month) with THREE
--      independent period-key columns (month_year, quarter_key, day_key),
--      not a single month_year driving all three counters. A single
--      month-keyed row can't correctly model a quarterly reset (filings)
--      or a daily reset (AI chats) — e.g. under a pure month_year scheme,
--      ai_chats_used would only reset once a month instead of once a day,
--      silently under-limiting free users for 29 of every 30 days. Each
--      counter is lazily reset against its own period key whenever that
--      key goes stale, inside the same atomic check_and_increment call.
--   3. RLS is service_role-only, no anon/authenticated policies — same
--      "no Supabase Auth session exists" rationale as every other table in
--      this schema (see the big comment above `profiles` in schema.sql).
--      Access control happens in the API route (checkAndIncrementUsage()
--      is only ever called with the session's own verified user id).

create table if not exists public.usage_counters (
  user_id text primary key references public.profiles (id) on delete cascade,
  month_year text not null,               -- e.g. '2026-07' — period key for scans_used
  quarter_key text not null,              -- e.g. '2026-Q3' — period key for filings_used
  day_key date not null default current_date, -- period key for ai_chats_used
  filings_used int not null default 0,
  scans_used int not null default 0,
  ai_chats_used int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.usage_counters enable row level security;

-- Learned the hard way earlier in this project: RLS with zero policies
-- still blocks service_role unless it also holds the table-level GRANT.
grant select, insert, update, delete on public.usage_counters to service_role;

-- Atomically checks the free-tier limit for one usage type and, if under
-- it, increments and returns the new remaining count — all in one
-- `for update`-locked transaction so concurrent requests from the same
-- user (e.g. a double-click) can't both slip through. Callers are expected
-- to check the subscriber's plan themselves first (see checkAndIncrementUsage
-- in src/lib/usage.ts) and skip calling this entirely for pro/business —
-- this function only ever implements the free-tier limits.
create or replace function public.check_and_increment_usage(p_user_id text, p_type text)
returns table(allowed boolean, remaining int, "limit" int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month text := to_char(current_date, 'YYYY-MM');
  v_quarter text := to_char(current_date, 'YYYY') || '-Q' || to_char(current_date, 'Q');
  v_day date := current_date;
  v_limit int;
  v_used int;
  v_row public.usage_counters%rowtype;
begin
  case p_type
    when 'filing' then v_limit := 1;
    when 'scan' then v_limit := 5;
    when 'ai_chat' then v_limit := 5;
    else raise exception 'check_and_increment_usage: unknown type %', p_type;
  end case;

  insert into public.usage_counters (user_id, month_year, quarter_key, day_key)
  values (p_user_id, v_month, v_quarter, v_day)
  on conflict (user_id) do nothing;

  select * into v_row from public.usage_counters where user_id = p_user_id for update;

  if v_row.month_year <> v_month then
    update public.usage_counters set month_year = v_month, scans_used = 0 where user_id = p_user_id;
    v_row.scans_used := 0;
  end if;
  if v_row.quarter_key <> v_quarter then
    update public.usage_counters set quarter_key = v_quarter, filings_used = 0 where user_id = p_user_id;
    v_row.filings_used := 0;
  end if;
  if v_row.day_key <> v_day then
    update public.usage_counters set day_key = v_day, ai_chats_used = 0 where user_id = p_user_id;
    v_row.ai_chats_used := 0;
  end if;

  v_used := case p_type
    when 'filing' then v_row.filings_used
    when 'scan' then v_row.scans_used
    when 'ai_chat' then v_row.ai_chats_used
  end;

  if v_used >= v_limit then
    return query select false, 0, v_limit;
    return;
  end if;

  case p_type
    when 'filing' then update public.usage_counters set filings_used = filings_used + 1, updated_at = now() where user_id = p_user_id;
    when 'scan' then update public.usage_counters set scans_used = scans_used + 1, updated_at = now() where user_id = p_user_id;
    when 'ai_chat' then update public.usage_counters set ai_chats_used = ai_chats_used + 1, updated_at = now() where user_id = p_user_id;
  end case;

  return query select true, (v_limit - v_used - 1), v_limit;
end;
$$;

-- Run this in the Supabase SQL editor. Adds real storage for: parsed GCash
-- transactions, TaxLaya AI chat history, and Business-plan team invites.
--
-- Same conventions as every migration since 005: user_id is `text` (Prisma
-- cuid, not a real uuid), RLS enabled with service_role-only grants (no
-- Supabase Auth session exists in this app — see the big comment above
-- `profiles` in schema.sql), access control enforced in the API routes.
--
-- business_id is `text`, not `uuid`: businesses.id is declared `text` in the
-- live schema (defaulted via gen_random_uuid(), but the column type itself
-- is text) — confirmed via the PostgREST OpenAPI schema before writing this,
-- since businesses was created out-of-band and was never in a committed
-- migration to check against.

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles (id) on delete cascade,
  business_id text references public.businesses (id) on delete set null,
  transaction_date date not null,
  description text not null,
  amount numeric not null,
  type text not null check (type in ('income', 'expense')),
  source text not null default 'gcash_upload',
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_id_idx on public.transactions (user_id, transaction_date desc);

alter table public.transactions enable row level security;
grant select, insert, update, delete on public.transactions to service_role;

create table if not exists public.taxlaya_chats (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  created_at timestamptz not null default now()
);

create index if not exists taxlaya_chats_user_id_idx on public.taxlaya_chats (user_id, created_at desc);

alter table public.taxlaya_chats enable row level security;
grant select, insert, update, delete on public.taxlaya_chats to service_role;

-- Business-plan team invites. This records the invite only — it does NOT
-- grant the invited email a second login into the owner's account data.
-- That would require a real multi-tenant access model (a second Prisma
-- User row scoped to view/edit the owner's businesses/filings), which is a
-- genuine auth-architecture change beyond what a single migration + routes
-- can safely deliver. Treat this table as "who's been invited and whether
-- they've acknowledged it," not as a working shared-login system yet.
create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null references public.profiles (id) on delete cascade,
  invited_email text not null,
  role text not null default 'member' check (role in ('member', 'accountant')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  created_at timestamptz not null default now()
);

create index if not exists team_invites_owner_idx on public.team_invites (owner_user_id, created_at desc);

alter table public.team_invites enable row level security;
grant select, insert, update, delete on public.team_invites to service_role;

-- Admin v2: click-tracking for the "Referral Link" feature. ref_email is
-- nullable since a tampered/garbage ?ref value still gets logged via
-- raw_ref for visibility but is never trusted as an identity.
create table if not exists public.referral_clicks (
  id uuid primary key default gen_random_uuid(),
  ref_email text,
  raw_ref text not null,
  created_at timestamptz not null default now()
);

create index if not exists referral_clicks_ref_email_idx on public.referral_clicks (ref_email);

alter table public.referral_clicks enable row level security;
grant select, insert, update, delete on public.referral_clicks to service_role;

-- Quarter-based draft/finalize tracking on top of transactions, plus the
-- bir_filings history table and the sum_quarter_transactions() RPC. See
-- supabase/migrations/010_quarter_status_bir_filings.sql for the full
-- rationale (kept in sync with that file).
alter table public.transactions
  add column if not exists quarter smallint,
  add column if not exists year integer,
  add column if not exists status text not null default 'draft' check (status in ('draft', 'finalized'));

create index if not exists transactions_quarter_status_idx
  on public.transactions (user_id, year, quarter, status, type);

create table if not exists public.bir_filings (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles (id) on delete cascade,
  quarter smallint not null check (quarter between 1 and 4),
  year integer not null,
  gross numeric not null,
  tax_due numeric not null,
  status text not null default 'filed' check (status in ('filed')),
  finalized_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists bir_filings_user_idx on public.bir_filings (user_id, year desc, quarter desc);

alter table public.bir_filings enable row level security;
grant select, insert, update, delete on public.bir_filings to service_role;

create or replace function public.sum_quarter_transactions(
  p_user_id text,
  p_year integer,
  p_quarter smallint,
  p_status text default 'draft'
)
returns table (gross numeric, count bigint)
language sql
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0) as gross, count(*) as count
  from transactions
  where user_id = p_user_id
    and year = p_year
    and quarter = p_quarter
    and status = p_status
    and type = 'income';
$$;

grant execute on function public.sum_quarter_transactions(text, integer, smallint, text) to service_role;

-- BIR Guard [BETA] — manual-entry version (no stored BIR credentials, no
-- automated portal scraping — see 011_bir_guard.sql for why).
create table if not exists public.bir_open_cases (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles (id) on delete cascade,
  form_type text not null,
  tax_period text not null,
  status text not null default 'open' check (status in ('open', 'penalty', 'filed')),
  penalty_amount numeric not null default 0,
  tax_due_amount numeric not null default 0,
  due_date date,
  notes text,
  screenshot_url text,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists bir_open_cases_user_idx on public.bir_open_cases (user_id, created_at desc);

alter table public.bir_open_cases enable row level security;
grant select, insert, update, delete on public.bir_open_cases to service_role;

-- BIR Guard [BUSINESS ONLY] — LOA (Letter of Authority) tracker.
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

-- BIR Guard [BUSINESS ONLY] — one active RDO-transfer draft per user.
create table if not exists public.bir_rdo_transfers (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique references public.profiles (id) on delete cascade,
  from_rdo_code text not null default '',
  from_rdo_name text not null default '',
  to_rdo_code text not null default '',
  to_rdo_name text not null default '',
  checklist jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.bir_rdo_transfers enable row level security;
grant select, insert, update, delete on public.bir_rdo_transfers to service_role;

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

-- Business Toolkit — DTI/SEC/Mayor's tab registration history.
create table if not exists public.business_registrations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('OPEN', 'CLOSE', 'SPA', 'DTI', 'SEC', 'MAYORS')),
  data jsonb not null default '{}'::jsonb,
  status text not null default 'generated',
  created_at timestamptz not null default now()
);

create index if not exists business_registrations_user_idx on public.business_registrations (user_id, created_at desc);

alter table public.business_registrations enable row level security;
grant select, insert, update, delete on public.business_registrations to service_role;

-- E-Invoice module.
create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles (id) on delete cascade,
  invoice_number text not null,
  client_name text not null,
  client_email text,
  client_tin text,
  client_address text,
  business_info jsonb not null default '{}'::jsonb,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  tax_type text not null default 'non_vat' check (tax_type in ('non_vat', 'vat')),
  tax_amount numeric not null default 0,
  total numeric not null default 0,
  currency text not null default 'PHP',
  payment_terms integer,
  due_date date,
  notes text,
  payment_details jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid')),
  tax_included boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoices_user_idx on public.invoices (user_id, created_at desc);
create unique index if not exists invoices_user_number_idx on public.invoices (user_id, invoice_number);

alter table public.invoices enable row level security;
grant select, insert, update, delete on public.invoices to service_role;

create table if not exists public.invoice_settings (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique references public.profiles (id) on delete cascade,
  prefix text not null default 'INV',
  next_number integer not null default 1,
  default_terms text,
  default_notes text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.invoice_settings enable row level security;
grant select, insert, update, delete on public.invoice_settings to service_role;

insert into storage.buckets (id, name, public)
values ('invoice-logos', 'invoice-logos', false)
on conflict (id) do nothing;

-- Axla Payroll — separate product, separate plan tiers (starter/business/
-- enterprise), deliberately its own subscriptions table rather than a row
-- in `subscriptions` (see migration 017 for why).
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

create table if not exists public.payroll_staff (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references public.profiles (id) on delete cascade,
  name text not null,
  gcash text,
  daily_rate numeric not null default 479,
  position text,
  branch text,
  created_at timestamptz not null default now()
);

create index if not exists payroll_staff_owner_idx on public.payroll_staff (owner_id, created_at desc);

alter table public.payroll_staff enable row level security;
grant select, insert, update, delete on public.payroll_staff to service_role;

create table if not exists public.payroll_attendance (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null references public.payroll_staff (id) on delete cascade,
  date date not null,
  time_in timestamptz,
  time_out timestamptz,
  hours numeric,
  selfie_url text,
  created_at timestamptz not null default now(),
  unique (staff_id, date)
);

create index if not exists payroll_attendance_staff_idx on public.payroll_attendance (staff_id, date desc);

alter table public.payroll_attendance enable row level security;
grant select, insert, update, delete on public.payroll_attendance to service_role;

create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  owner_id text not null references public.profiles (id) on delete cascade,
  month text not null,
  cut_off text,
  total_sahod numeric not null default 0,
  staff_count integer,
  status text not null default 'draft' check (status in ('draft', 'finalized')),
  breakdown jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists payroll_runs_owner_idx on public.payroll_runs (owner_id, created_at desc);

alter table public.payroll_runs enable row level security;
grant select, insert, update, delete on public.payroll_runs to service_role;

