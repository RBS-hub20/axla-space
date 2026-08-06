-- Run this in the Supabase SQL editor. Free signup launch: the 30-day Pro
-- trial granted to former waitlist emails (see src/lib/auth/provision-
-- signup.ts) upserts into the existing public.subscriptions table — the
-- same table every real PayMongo payment activates, so every plan check
-- in the app (getUserPlan, checkAndIncrementUsage) honors a trial exactly
-- like a real paid subscription. subscriptions.provider's check constraint
-- only allowed ('paymongo', 'xendit') — widen it to include 'trial' so
-- that upsert doesn't fail its own CHECK constraint. Idempotent (drop +
-- recreate), same pattern as every other constraint change in this repo.
alter table public.subscriptions drop constraint if exists subscriptions_provider_check;
alter table public.subscriptions add constraint subscriptions_provider_check
  check (provider in ('paymongo', 'xendit', 'trial'));
