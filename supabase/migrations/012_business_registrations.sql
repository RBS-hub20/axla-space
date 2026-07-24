-- Run this in the Supabase SQL editor. Business Toolkit's DTI/SEC/Mayor's
-- tab — additive only, one new table, nothing existing altered.
--
-- Records that a kit was generated and with what data, so a user can see
-- their own registration history — not a real-time filing status with any
-- government agency (this app never talks to dti.gov.ph/sec.gov.ph/any LGU).
--
-- Same conventions as every migration since 005: user_id is `text` (Prisma
-- cuid, not a Supabase auth.users uuid), RLS enabled with service_role-only
-- grants, access control enforced in API routes.

create table if not exists public.business_registrations (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles (id) on delete cascade,
  type text not null check (type in ('DTI', 'SEC', 'MAYORS')),
  data jsonb not null default '{}'::jsonb,
  status text not null default 'generated',
  created_at timestamptz not null default now()
);

create index if not exists business_registrations_user_idx on public.business_registrations (user_id, created_at desc);

alter table public.business_registrations enable row level security;
grant select, insert, update, delete on public.business_registrations to service_role;
