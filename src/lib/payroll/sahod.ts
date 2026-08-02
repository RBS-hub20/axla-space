// Deliberately NOT "server-only" — the breakdown shape here is rendered
// directly in the client dashboard (payroll_runs.breakdown jsonb), and the
// withholding-tax estimate is illustrative math with no DB/auth dependency.

export interface StaffAttendanceSummary {
  staffId: string;
  name: string;
  dailyRate: number;
  daysPresent: number;
  /** True when daysPresent came from the "no attendance on file, use the cut-off default" confirm flow rather than real clocked records — surfaced everywhere the breakdown is shown so a default is never mistaken for a real count. */
  estimated?: boolean;
}

export interface PayrollBreakdownRow extends StaffAttendanceSummary {
  basicPay: number;
}

/** Basic pay only — no overtime, no government-mandated deductions (SSS/PHIC/HDMF), per Phase 1's "basic+OT-less govt" scope. */
export function computeBasicPay(rows: StaffAttendanceSummary[]): PayrollBreakdownRow[] {
  return rows.map((r) => ({ ...r, basicPay: r.dailyRate * r.daysPresent }));
}

export type CutOff = "1-15" | "16-31" | "full";

export const CUTOFF_LABELS: Record<CutOff, string> = {
  "1-15": "1st Half (1–15)",
  "16-31": "2nd Half (16–End)",
  full: "Full Month",
};

/** Applied only to staff with zero real attendance records in the cut-off, and only after the user explicitly confirms — see the "no attendance found" modal in PayrollAppDashboard. Half-month cut-offs default to 13 days, a full month to 26, matching the spec's stated figures. */
export const DEFAULT_DAYS_BY_CUTOFF: Record<CutOff, number> = {
  "1-15": 13,
  "16-31": 13,
  full: 26,
};

export interface DateRange {
  /** Inclusive, YYYY-MM-DD. */
  from: string;
  /** Exclusive upper bound, YYYY-MM-DD — pairs with a `.lt("date", to)` query. */
  to: string;
}

/** Pure string/UTC date math (no local-timezone Date object surprises) — same convention already used by the attendance and compute routes. */
export function getCutOffRange(month: string, cutOff: CutOff): DateRange {
  const [year, mo] = month.split("-").map(Number);
  // Date.UTC's month arg is 0-indexed (0=Jan) but `mo` is already 1-indexed
  // (parsed straight from "08" = August) — passing it in directly rolls
  // forward exactly one month for free, landing on the 1st of the month
  // after `month`, year rollover included. Verified: 2026-12 -> 2027-01-01.
  const nextMonthFirst = new Date(Date.UTC(year, mo, 1)).toISOString().slice(0, 10);

  if (cutOff === "1-15") {
    return { from: `${month}-01`, to: `${month}-16` };
  }
  if (cutOff === "16-31") {
    return { from: `${month}-16`, to: nextMonthFirst };
  }
  return { from: `${month}-01`, to: nextMonthFirst };
}

export const DOLE_MIN_DAILY_WAGE = 479; // Batangas reference figure, per spec — actual minimum wage varies by region/sector; verify locally.

export interface DoleWarning {
  staffId: string;
  name: string;
  dailyRate: number;
  shortfall: number;
}

/** Flags any staff whose daily_rate is below the reference minimum wage — informational, not a legal determination (regional/sector minimums vary). */
export function checkDoleCompliance(staff: { id: string; name: string; daily_rate: number }[]): DoleWarning[] {
  return staff
    .filter((s) => Number(s.daily_rate) < DOLE_MIN_DAILY_WAGE)
    .map((s) => ({ staffId: s.id, name: s.name, dailyRate: Number(s.daily_rate), shortfall: DOLE_MIN_DAILY_WAGE - Number(s.daily_rate) }));
}

/**
 * Simplified, illustrative withholding-tax estimate on monthly compensation
 * — NOT the full BIR graduated withholding table (which also depends on
 * payroll period, statutory deduction status, etc.). Below the ₱20,833/mo
 * threshold (₱250k/yr ÷ 12) withholding is 0; above it, a flat 15% on the
 * excess as a rough approximation. Explicitly labeled as an estimate
 * everywhere it's shown — verify against the actual BIR withholding table
 * or an accountant before relying on it for real 1601C filing.
 */
export function estimateWithholdingTax(monthlyCompensation: number): number {
  const threshold = 250_000 / 12;
  if (monthlyCompensation <= threshold) return 0;
  return Math.round((monthlyCompensation - threshold) * 0.15);
}
