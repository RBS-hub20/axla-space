-- Run this in the Supabase SQL editor. E-Invoice module — additive only,
-- two new tables + one new storage bucket, nothing existing altered.
--
-- Same conventions as every migration since 005: user_id is `text` (Prisma
-- cuid), RLS enabled with service_role-only grants, access control enforced
-- in API routes.

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.profiles (id) on delete cascade,
  invoice_number text not null,
  client_name text not null,
  client_email text,
  client_tin text,
  client_address text,
  business_info jsonb not null default '{}'::jsonb,
  items jsonb not null default '[]'::jsonb,
  subtotal numeric not null default 0,
  tax_type text not null default 'non_vat' check (tax_type in ('non_vat', 'vat')),
  tax_amount numeric not null default 0,
  total numeric not null default 0,
  currency text not null default 'PHP',
  payment_terms integer,
  due_date date,
  notes text,
  payment_details jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'sent', 'paid')),
  tax_included boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists invoices_user_idx on public.invoices (user_id, created_at desc);
create unique index if not exists invoices_user_number_idx on public.invoices (user_id, invoice_number);

alter table public.invoices enable row level security;
grant select, insert, update, delete on public.invoices to service_role;

create table if not exists public.invoice_settings (
  id uuid primary key default gen_random_uuid(),
  user_id text not null unique references public.profiles (id) on delete cascade,
  prefix text not null default 'INV',
  next_number integer not null default 1,
  default_terms text,
  default_notes text,
  logo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.invoice_settings enable row level security;
grant select, insert, update, delete on public.invoice_settings to service_role;

-- Private bucket for uploaded invoice logos — same pattern as `receipts`:
-- signed URLs generated server-side with the service role key, no public
-- bucket URL, no storage.objects policies needed since RLS + zero policies
-- already denies anon/public access by default.
insert into storage.buckets (id, name, public)
values ('invoice-logos', 'invoice-logos', false)
on conflict (id) do nothing;
