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

export const PAYROLL_STAFF_LIMITS: Record<PayrollPlan, number | null> = {
  starter: 5,
  business: 50,
  enterprise: null, // unlimited
};

export const DEFAULT_DAILY_RATE = 479; // Batangas minimum wage reference, used as the Add Staff form's auto-suggested daily rate
