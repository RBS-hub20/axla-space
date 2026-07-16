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

create index if not exists chat_messages_created_at_idx
  on public.chat_messages (created_at desc);
