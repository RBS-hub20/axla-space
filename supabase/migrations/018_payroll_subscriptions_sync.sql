-- Run this in the Supabase SQL editor. Extends subscriptions.plan's check
-- constraint to also allow Axla Payroll's three plan values, so the
-- existing admin dashboard (Subscribers/Waitlist tabs, MRR/revenue
-- aggregation) can show Payroll signups without a second parallel table.
--
-- This is purely for ADMIN REPORTING — real Axla Payroll access control
-- still runs entirely through payroll_subscriptions (migration 017) via
-- src/lib/payroll/plan.ts, tied to the actual logged-in account. This row
-- is a separate, synthetic-email record the webhook writes for visibility
-- only (see src/app/api/webhooks/paymongo/route.ts's early payroll branch).
-- A payroll_* plan value can never satisfy getUserPlan()'s exact "pro"/
-- "business" checks, so this can't grant real TaxLaya access either way.
alter table public.subscriptions drop constraint if exists subscriptions_plan_check;
alter table public.subscriptions add constraint subscriptions_plan_check
  check (plan in ('free', 'pro', 'business', 'payroll_starter', 'payroll_business', 'payroll_enterprise'));
