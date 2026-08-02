// Axla Payroll launch promo — 50% OFF for 2 months, until Aug 31, 2026.
// Deliberately NOT "server-only" — used by both the checkout API and the
// public /payroll pricing page's countdown banner, same convention as
// src/lib/promo.ts (TaxLaya's LAUNCH50).
export const PAYROLL_PROMO = {
  endDate: new Date("2026-08-31T23:59:59+08:00"),
};

export function isPayrollPromoActive(now: number = Date.now()): boolean {
  return now < PAYROLL_PROMO.endDate.getTime();
}
