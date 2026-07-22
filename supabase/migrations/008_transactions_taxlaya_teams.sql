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
