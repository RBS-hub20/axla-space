-- Run this in the Supabase SQL editor. Proof of Payment Phase 1 —
-- additive only: one new column on payroll_runs, one new private storage
-- bucket. Same conventions as every migration since 005: RLS enabled with
-- service_role-only grants, access control enforced in API routes (no
-- Supabase Auth session in this app — see the standing note in migration
-- 019/020).
--
-- payment_proofs is keyed by staffId (matching payroll_runs.breakdown's
-- own staffId key) rather than a separate payroll_payment_proofs table —
-- proof-of-payment is inherently a property of "this staff member's line
-- in this specific run", same relationship breakdown already has, and
-- jsonb keeps it a single read/write alongside a run's other data instead
-- of a second table that always has to be joined back to the run anyway.
-- Shape per key (see src/lib/payroll/payment-proof.ts):
--   { status: 'unpaid'|'paid'|'confirmed', amount, gcashRef, receiptPath,
--     note, paidAt, paidByOwner, confirmedAt, confirmedSelfiePath }
alter table public.payroll_runs add column if not exists payment_proofs jsonb not null default '{}'::jsonb;

-- Private bucket for GCash receipt screenshots and payment-confirmation
-- selfies — same pattern as invoice-logos/payroll-selfies: signed URLs
-- generated server-side with the service role key, never a public path.
insert into storage.buckets (id, name, public)
values ('payroll-receipts', 'payroll-receipts', false)
on conflict (id) do nothing;
