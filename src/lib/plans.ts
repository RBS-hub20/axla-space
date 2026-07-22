// Deliberately NOT "server-only" — imported by both the billing API routes
// and the client-side Settings billing UI, so pricing displayed to the user
// always matches what the checkout route actually charges.

export type PaidPlan = "pro" | "business";
export type BillingCycle = "monthly" | "yearly";

/** PHP pesos. Yearly = 10 months' worth (2 months free) — same figures used for MRR/mock data in payments-stats.ts. */
export const PLAN_PRICING: Record<PaidPlan, Record<BillingCycle, number>> = {
  pro: { monthly: 499, yearly: 499 * 10 },
  business: { monthly: 1499, yearly: 1499 * 10 },
};
