import { getQuarterDeadline } from "@/lib/tax-calculator";

export function getCurrentQuarter(date: Date = new Date()): { quarter: 1 | 2 | 3 | 4; year: number } {
  const month = date.getUTCMonth(); // 0-11
  const quarter = (Math.floor(month / 3) + 1) as 1 | 2 | 3 | 4;
  return { quarter, year: date.getUTCFullYear() };
}

/**
 * Filing deadline for a quarter, defaulting to the 1701Q schedule
 * (Q1 May 15, Q2 Aug 15, Q3 Nov 15, Q4 Apr 15 next year) since that's the
 * form most dashboard surfaces reference. Pass formType explicitly for
 * 2551Q (25 days after quarter end) — don't assume every form uses the
 * 1701Q dates, that's wrong for percentage-tax filers.
 *
 * Delegates to the single source of truth in tax-calculator.ts rather than
 * re-deriving the month/day table here, so there's only one place that can
 * get a BIR deadline wrong.
 */
export function getFilingDeadline(
  quarter: 1 | 2 | 3 | 4,
  year: number,
  formType: "2551Q" | "1701Q" = "1701Q",
): Date {
  return getQuarterDeadline(formType, quarter, year);
}

export function getQuarterLabel(quarter: 1 | 2 | 3 | 4, year: number): string {
  return `Q${quarter} ${year}`;
}

export function isOverdue(deadline: Date, asOf: Date = new Date()): boolean {
  return asOf.getTime() > deadline.getTime();
}
