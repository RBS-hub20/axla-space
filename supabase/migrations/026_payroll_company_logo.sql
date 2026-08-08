-- Company branding hero on /payroll/app — owner-uploaded logo.

alter table public.payroll_companies add column if not exists logo_url text;

-- Private bucket, same pattern as invoice-logos/payroll-selfies/payroll-
-- receipts: logo_url stores only the raw storage path, never a URL —
-- signed URLs are generated server-side (1hr TTL, re-signed on every load
-- of GET /api/payroll/company) so nothing here can go stale or leak via a
-- public bucket URL.
insert into storage.buckets (id, name, public)
values ('payroll-logos', 'payroll-logos', false)
on conflict (id) do nothing;
