-- Run this in the Supabase SQL editor. Adds the columns the waitlist-gate
-- login check and the admin waitlist dashboard need. All additive/idempotent
-- (safe to re-run) — does not touch bir_hate_level, businesses, or
-- profiles.updated_at, which are already set up and working.

-- Existing rows default to 'pending' (not approved) — the safe default,
-- since none of them have gone through the new admin-approve flow yet.
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

-- Lets a non-founder account be granted admin access (in addition to the
-- hardcoded founder email checked in src/lib/admin.ts) without a schema
-- change later. Defaults to 'user' for everyone existing.
alter table public.profiles add column if not exists role text not null default 'user';
