// Deliberately NOT "server-only" — read by both the checkout API routes and
// the public /payroll pricing page (client component), same convention as
// src/lib/plans.ts for TaxLaya Pro/Business.
export type PayrollPlan = "starter" | "business" | "enterprise";

export const PAYROLL_PLANS: PayrollPlan[] = ["starter", "business", "enterprise"];

export const PAYROLL_PLAN_LABELS: Record<PayrollPlan, string> = {
  starter: "Starter",
  business: "Business",
  enterprise: "Enterprise",
};

export const PAYROLL_PLAN_PRICING: Record<PayrollPlan, { regular: number; promo: number }> = {
  starter: { regular: 299, promo: 149 },
  business: { regular: 599, promo: 299 },
  enterprise: { regular: 1499, promo: 799 },
};

/** No active subscription — every logged-in user starts here, not blocked from the dashboard, just capped. */
export type PayrollTier = "free" | PayrollPlan;

export function tierOf(plan: PayrollPlan | null): PayrollTier {
  return plan ?? "free";
}

export const PAYROLL_STAFF_LIMITS: Record<PayrollTier, number | null> = {
  free: 1,
  starter: 5,
  business: 50,
  enterprise: null, // unlimited
};

/** Free tier: one manual attendance entry, lifetime (not per day) — enough to see the feature work, not enough to run real timekeeping. */
export const FREE_ATTENDANCE_LIMIT = 1;

export const DEFAULT_DAILY_RATE = 479; // Batangas minimum wage reference, used as the Add Staff form's auto-suggested daily rate
