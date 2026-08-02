// Deliberately NOT "server-only" — imported by both the billing API routes
// and the client-side Settings billing UI, so pricing displayed to the user
// always matches what the checkout route actually charges.

export type PaidPlan = "pro" | "business";
export type BillingCycle = "monthly" | "yearly";

/**
 * Owner override — this single email always resolves as a lifetime BUSINESS
 * plan, no DB row required (see getActivePaidPlan in src/lib/usage.ts,
 * the one place every plan check funnels through). Same founder account as
 * ADMIN_EMAIL in src/lib/admin.ts, kept as a separate constant here because
 * this one gates billing/plan checks, not admin-panel access — the two
 * happen to be the same person today but are conceptually different grants.
 */
export const OWNER_EMAIL = "renzsom2022@gmail.com";

/** PHP pesos. Yearly = 10 months' worth (2 months free) — same figures used for MRR/mock data in payments-stats.ts. */
export const PLAN_PRICING: Record<PaidPlan, Record<BillingCycle, number>> = {
  pro: { monthly: 499, yearly: 499 * 10 },
  business: { monthly: 1499, yearly: 1499 * 10 },
};
