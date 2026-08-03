-- Run this in the Supabase SQL editor. Same conventions as every migration
-- since 005: user_id/owner_user_id/member_user_id are `text` (Prisma cuid,
-- not a real uuid), RLS enabled with service_role-only grants (no Supabase
-- Auth session exists in this app — see the big comment above `profiles` in
-- schema.sql), access control enforced in the API routes, not RLS.
--
-- Turns team_invites (migration 008 — invite ledger only, accepting one did
-- nothing) into a working shared-access system:
--   1. team_invites gets a real accept token + expiry, and its role check
--      widens from ('member','accountant') to the four real roles.
--   2. team_members is new — the row that actually grants an accepted
--      invitee (member_user_id) read/write access to the owner's account
--      (owner_user_id), enforced by every dashboard API route calling
--      getEffectiveOwnerId() (src/lib/team.ts) instead of using
--      getCurrentUser().id directly.

-- Existing 'member' rows have no real permission model behind them yet
-- (the whole point of this migration) — closest real equivalent is 'va'
-- (view-only), so remap before tightening the check constraint.
update public.team_invites set role = 'va' where role = 'member';

alter table public.team_invites drop constraint if exists team_invites_role_check;
alter table public.team_invites add constraint team_invites_role_check
  check (role in ('accountant', 'team_leader', 'va', 'admin'));

alter table public.team_invites add column if not exists token uuid not null default gen_random_uuid();
alter table public.team_invites add column if not exists expires_at timestamptz not null default (now() + interval '7 days');

-- Backfill: rows inserted before this migration got `now()` as their
-- default expires_at above, which is wrong (they'd all read as instantly
-- expired) — give already-pending invites a fresh 7-day window from today
-- instead of from their original created_at, since the old email they were
-- sent had no working link/token anyway.
update public.team_invites set expires_at = now() + interval '7 days' where status = 'pending';

create unique index if not exists team_invites_token_idx on public.team_invites (token);

create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null references public.profiles (id) on delete cascade,
  member_user_id text not null references public.profiles (id) on delete cascade,
  invited_email text not null,
  role text not null check (role in ('accountant', 'team_leader', 'va', 'admin')),
  status text not null default 'active' check (status in ('active', 'removed')),
  invite_id uuid references public.team_invites (id) on delete set null,
  joined_at timestamptz not null default now(),
  -- One active membership per (owner, member) pair — re-inviting the same
  -- person after removal is a new row, not an upsert, so joined_at/history
  -- stays accurate; enforced in the accept route, not a DB constraint,
  -- since "one active row" isn't expressible as a plain unique index
  -- without excluding removed rows from it.
  unique (owner_user_id, member_user_id, invite_id)
);

create index if not exists team_members_owner_idx on public.team_members (owner_user_id, status);
create index if not exists team_members_member_idx on public.team_members (member_user_id, status);

alter table public.team_members enable row level security;
grant select, insert, update, delete on public.team_members to service_role;
