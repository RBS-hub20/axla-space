-- Run this in the Supabase SQL editor. Adds quarter-based draft/finalize
-- tracking on top of the existing transactions table (does NOT remove or
-- rename description/type — those already power the GCash upload list and
-- the dashboard overview's Revenue Timeline chart, and must keep working).
--
-- Same conventions as every migration since 005: user_id is `text` (Prisma
-- cuid), RLS enabled with service_role-only grants, access control enforced
-- in API routes.

alter table public.transactions
  add column if not exists quarter smallint,
  add column if not exists year integer,
  add column if not exists status text not null default 'draft' check (status in ('draft', 'finalized'));

-- Backfill quarter/year for rows that predate this migration so they're
-- included in quarter-sum queries too.
update public.transactions
set
  quarter = (extract(month from transaction_date)::int - 1) / 3 + 1,
  year = extract(year from transaction_date)::int
where quarter is null or year is null;

create index if not exists transactions_quarter_status_idx
  on public.transactions (user_id, year, quarter, status, type);

-- One row per finalized quarter — the "official" locked summary a 2551Q
-- filing was generated from. Deliberately separate from the existing
-- bir_forms table (the real filing tracker used by the "New Form" dialog
-- and usage-limit enforcement on /dashboard/forms) rather than repurposing
-- it, so that existing feature keeps working untouched.
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

-- Server-side SUM so the dashboard never has to load full transaction rows
-- just to show a quarter total (the whole point of this migration — avoid
-- the "load everything to compute a number" pattern at scale). Only sums
-- income rows: a 2551Q's gross sales/receipts figure must not be inflated
-- by expense rows sharing the same quarter.
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
