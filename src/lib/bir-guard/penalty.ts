// Deliberately NOT "server-only" — this is imported both by the API routes
// (to compute the live, current-as-of-today total) and by the Add Case
// modal on the client (to preview the breakdown as the user types, before
// the case is even saved).

export interface BirPenaltyBreakdown {
  daysLate: number;
  compromise: number;
  surcharge: number;
  interest: number;
  total: number;
}

const COMPROMISE_BASE = 1000;
const SURCHARGE_RATE = 0.25;
const INTEREST_RATE_ANNUAL = 0.12;
const MS_PER_DAY = 86_400_000;

/**
 * Standard BIR late-filing penalty formula: 25% surcharge + 12%/yr interest
 * prorated by days late + a flat ₱1,000 compromise — all off the tax due
 * amount. `asOf` defaults to now, but a resolved case passes its
 * resolved_at so the penalty stops accruing once filed.
 */
export function calcBirPenalty(taxDueAmount: number, dueDateISO: string, asOf: Date = new Date()): BirPenaltyBreakdown {
  const due = new Date(`${dueDateISO}T00:00:00`);
  const daysLate = Math.max(0, Math.floor((asOf.getTime() - due.getTime()) / MS_PER_DAY));

  if (daysLate === 0) {
    return { daysLate: 0, compromise: 0, surcharge: 0, interest: 0, total: taxDueAmount };
  }

  const compromise = COMPROMISE_BASE;
  const surcharge = taxDueAmount * SURCHARGE_RATE;
  const interest = taxDueAmount * INTEREST_RATE_ANNUAL * (daysLate / 365);
  const total = taxDueAmount + surcharge + interest + compromise;
  return { daysLate, compromise, surcharge, interest, total };
}
