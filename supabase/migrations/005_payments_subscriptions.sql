-- Run this in the Supabase SQL editor. Adds PayMongo/Xendit payment tracking
-- for the admin Revenue KPIs, revenue chart, and recent-payments feed.
--
-- Deviations from a literal "uuid" spec, both required for the migration to
-- actually run against this schema:
--   1. `user_id` is `text`, not `uuid` — `public.profiles.id` is the Prisma
--      User.id (a `cuid()` string), so a `uuid` foreign key to it would be a
--      type mismatch and fail to create. Same convention as every other
--      user_id column in this schema (tax_calculations, bir_forms, receipts).
--   2. `payment_method` (gcash/maya/card/other) is added on `payments` on top
--      of the requested columns — the admin "Recent Payments" feed needs a
--      per-payment method to pick an icon, and `provider` (paymongo/xendit)
--      alone can't tell GCash from a card. Nullable, best-effort, populated
--      by the webhook handlers when the provider reports it.
--
-- RLS: enabled on both tables, but with NO anon/authenticated policies —
-- same "service_role only" pattern as every other table below profiles in
-- schema.sql. This app has no Supabase Auth session (see the big comment
-- above the `profiles` table), so there is no `auth.uid()` to write a real
-- "users can read own" policy against; a policy like `auth.uid() = user_id`
-- would just never match anything and create a false sense of protection.
-- Access control instead happens in the API routes: the admin routes require
-- the admin session cookie / isAdmin() check, and any future user-facing
-- payment history route must filter `where email = <session user's email>`
-- itself, exactly like every other dashboard table.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  user_id text references public.profiles (id) on delete set null,
  plan text not null default 'free' check (plan in ('free', 'pro', 'business')),
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
  payment_method text, -- 'gcash' | 'maya' | 'card' | 'other', best-effort from the webhook payload
  plan text,
  created_at timestamptz not null default now()
);

create index if not exists payments_email_idx on public.payments (email);
create index if not exists payments_created_at_idx on public.payments (created_at desc);

alter table public.payments enable row level security;

-- RLS with zero policies still blocks service_role unless it also holds the
-- underlying table-level GRANT — Supabase's dashboard SQL editor runs as a
-- role whose default privileges auto-grant new tables to service_role, but
-- a table created over a direct Postgres connection (e.g. Prisma's
-- DATABASE_URL) doesn't necessarily inherit that. Explicit and idempotent —
-- safe to re-run.
grant select, insert, update, delete on public.subscriptions to service_role;
grant select, insert, update, delete on public.payments to service_role;
