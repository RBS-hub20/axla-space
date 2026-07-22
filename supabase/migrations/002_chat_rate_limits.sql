-- Rate limiting for TaxLaya chat (/api/chat): 10 messages per IP per day.
-- Run this in the Supabase SQL editor.

create table if not exists public.chat_rate_limits (
  ip text not null,
  day date not null default current_date,
  count int not null default 0,
  primary key (ip, day)
);

alter table public.chat_rate_limits enable row level security;
-- No public policies: only the service_role key (used server-only in
-- /api/chat) can read or write this table; RLS blocks everyone else.

-- RLS with zero policies still blocks service_role unless it also holds the
-- underlying table-level GRANT — not automatic when this table is created
-- over a direct Postgres connection instead of Supabase's own SQL editor
-- session. Idempotent, safe to re-run.
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
