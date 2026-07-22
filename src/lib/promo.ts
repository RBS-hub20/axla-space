/**
 * LAUNCH50 promo — single source of truth for the countdown banner, the
 * checkout discount, and the BIR Forms paywall's promo pricing. A FIXED
 * end date, not a rolling "60 days from whenever this renders" window —
 * the latter would silently reset for every new page load/visitor and
 * never actually expire, which defeats the point of a countdown. Sep 20,
 * 2026 23:59:59 PH time is exactly 60 days from when this promo was built
 * (2026-07-22), computed once here rather than re-derived per request.
 *
 * PRO only, per explicit scope — Business isn't discounted by this promo.
 * proPricePesos is stored in whole pesos (not centavos) to match
 * PLAN_PRICING's convention everywhere else in the codebase; centavos
 * conversion happens at the PayMongo call site, same as every other price.
 * ₱499 * 50% = ₱249.50 — rounded down to the clean ₱249 the marketing copy
 * quotes everywhere ("₱249/mo"), not 249.50.
 */
export const PROMO = {
  code: "LAUNCH50",
  discount: 0.5,
  endDate: new Date("2026-09-20T23:59:59+08:00"),
  proPricePesos: 249,
} as const;

export function isPromoActive(now: number = Date.now()): boolean {
  return now < PROMO.endDate.getTime();
}
