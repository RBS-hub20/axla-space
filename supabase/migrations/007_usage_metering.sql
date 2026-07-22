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
