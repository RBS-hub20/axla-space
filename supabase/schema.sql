-- Run this in the Supabase SQL editor (Project -> SQL Editor -> New query)
-- to set up the waitlist table used by the landing page + admin dashboard.

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
