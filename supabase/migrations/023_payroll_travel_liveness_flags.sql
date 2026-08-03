-- Run this in the Supabase SQL editor. Additive only. Same conventions as
-- every migration since 005: RLS enabled with service_role-only grants (no
-- Supabase Auth session in this app — see the standing note in migration
-- 019/020).
--
-- Security audit finding #1 (GPS spoofing / impossible travel): new
-- signal columns on timekeeping_logs so the clock route can flag a clock
-- event as physically implausible relative to the same staff member's
-- previous event, or as coming from a spoofed/mocked location — without
-- ever hard-blocking the clock-in itself (needs_approval was already the
-- established soft-flag pattern for the geofence/code checks; this reuses
-- it rather than inventing a second rejection path).
alter table public.timekeeping_logs add column if not exists flag text;
alter table public.timekeeping_logs add column if not exists flag_note text;
alter table public.timekeeping_logs add column if not exists gps_accuracy numeric;
alter table public.timekeeping_logs add column if not exists blink_instruction text;
alter table public.timekeeping_logs add column if not exists buddy_punch_flagged boolean not null default false;
alter table public.timekeeping_logs add column if not exists buddy_punch_flagged_by text;
alter table public.timekeeping_logs add column if not exists buddy_punch_flagged_at timestamptz;

-- Security audit finding #5 (selfie liveness, manual-review mitigation):
-- "Flag as buddy punching" in the admin Timekeeping tab needs to write an
-- audit trail entry that isn't scoped to any payroll run — relax the
-- payroll_audit_logs table (added in migration 022 for payment-proof
-- mutations only) to allow that.
alter table public.payroll_audit_logs alter column payroll_run_id drop not null;
alter table public.payroll_audit_logs drop constraint if exists payroll_audit_logs_action_check;
alter table public.payroll_audit_logs add constraint payroll_audit_logs_action_check
  check (action in ('mark_paid', 'confirm', 'override', 'buddy_punch_flag'));
