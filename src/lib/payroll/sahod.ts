// Deliberately NOT "server-only" — the breakdown shape here is rendered
// directly in the client dashboard (payroll_runs.breakdown jsonb), and the
// withholding-tax estimate is illustrative math with no DB/auth dependency.

import type { RateType } from "@/lib/payroll/staff-fields";

export interface StaffAttendanceSummary {
  staffId: string;
  name: string;
  dailyRate: number;
  daysPresent: number;
  /** True when daysPresent came from the "no attendance on file, use the cut-off default" confirm flow rather than real clocked records — surfaced everywhere the breakdown is shown so a default is never mistaken for a real count. */
  estimated?: boolean;
}

/**
 * Every field below `basicPay` is optional — a run computed before this
 * engine existed only has staffId/name/dailyRate/daysPresent/basicPay in
 * its stored jsonb breakdown, and every consumer (PayslipBirTab, the
 * payslip PDF, the public /p/[token] page) has to keep rendering those old
 * rows correctly. New computes (see runs/compute/route.ts) populate all of
 * them; old rows just show "—" / fall back to basicPay wherever the UI
 * reads netPay ?? basicPay.
 */
export interface PayrollBreakdownRow extends StaffAttendanceSummary {
  basicPay: number;
  rateType?: RateType;
  lateMinutes?: number;
  lateDeduction?: number;
  undertimeMinutes?: number;
  undertimeDeduction?: number;
  overtimeMinutes?: number;
  overtimePay?: number;
  /** Always 0 — there's no sales-tracking data model in this app to multiply commission_pct against, so this is never fabricated. Kept as a field so the UI has somewhere real to render it once sales tracking exists. */
  commission?: number;
  advancesDeduction?: number;
  grossPay?: number;
  totalDeductions?: number;
  netPay?: number;
}

/** Basic pay only — no overtime, no government-mandated deductions (SSS/PHIC/HDMF). Superseded by computePayrollRow() for actual runs; kept for any caller that only wants the plain days×rate figure. */
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

/** Prices a minute of late/undertime/overtime against each rate type. Daily ÷ 8 standard hours; hourly is already a per-hour figure; monthly ÷ 26 working days ÷ 8 hours. Illustrative — actual per-hour equivalents vary by contract/CBA. */
export function ratePerHour(rateType: RateType, rateAmount: number): number {
  if (rateType === "hourly") return rateAmount;
  if (rateType === "monthly") return rateAmount / 26 / 8;
  return rateAmount / 8;
}

export interface PayrollComputeInput {
  staffId: string;
  name: string;
  /** Legacy field, kept for display/backward-compat — for rate_type='daily' this equals rateAmount. */
  dailyRate: number;
  rateType: RateType;
  rateAmount: number;
  /** Count of days with a real "present" attendance record in the period (see lib/payroll/shift.ts computeDayCell) — the daily-rate basic pay input, and the numerator for monthly proration. */
  daysPresent: number;
  /** Total minutes actually clocked (time_out − time_in, summed across present days) — the hourly-rate basic pay input. Unused for daily/monthly. */
  workedMinutes: number;
  /** Count of scheduled work days in the period that have already occurred (per work_days, excluding future dates) — the monthly-rate proration denominator. Unused for daily/hourly. */
  scheduledDaysInPeriod: number;
  estimated?: boolean;
  lateMinutes: number;
  undertimeMinutes: number;
  overtimeMinutes: number;
  /** Sum of pending payroll_cash_advances for this staff in this cut-off's date range — the caller is responsible for that query and for flipping those advances to 'deducted' once the run saves successfully. */
  advancesDeduction: number;
}

/**
 * The computation engine — basic pay (priced per rate_type) plus overtime,
 * minus late/undertime deductions and cash advances. No government
 * contributions or withholding tax yet (SSS/PhilHealth/Pag-IBIG tables
 * aren't implemented in this app) and no commission (no sales-tracking
 * data model exists to multiply commission_pct against) — both would be
 * fabricated numbers, so they're left out rather than guessed.
 */
export function computePayrollRow(input: PayrollComputeInput): PayrollBreakdownRow {
  const {
    staffId,
    name,
    dailyRate,
    rateType,
    rateAmount,
    daysPresent,
    workedMinutes,
    scheduledDaysInPeriod,
    estimated,
    lateMinutes,
    undertimeMinutes,
    overtimeMinutes,
    advancesDeduction,
  } = input;

  let basicPay: number;
  if (rateType === "hourly") {
    basicPay = rateAmount * (workedMinutes / 60);
  } else if (rateType === "monthly") {
    basicPay = scheduledDaysInPeriod > 0 ? rateAmount * (daysPresent / scheduledDaysInPeriod) : 0;
  } else {
    basicPay = dailyRate * daysPresent;
  }
  basicPay = Math.round(basicPay);

  const rph = ratePerHour(rateType, rateAmount);
  const lateDeduction = Math.round((rph / 60) * lateMinutes);
  const undertimeDeduction = Math.round((rph / 60) * undertimeMinutes);
  const overtimePay = Math.round(rph * (overtimeMinutes / 60) * 1.25);
  const commission = 0; // no sales-tracking data model exists yet — never fabricated

  const grossPay = basicPay + overtimePay + commission;
  const totalDeductions = lateDeduction + undertimeDeduction + advancesDeduction;
  const netPay = Math.max(0, grossPay - totalDeductions);

  return {
    staffId,
    name,
    dailyRate,
    daysPresent,
    estimated,
    basicPay,
    rateType,
    lateMinutes,
    lateDeduction,
    undertimeMinutes,
    undertimeDeduction,
    overtimeMinutes,
    overtimePay,
    commission,
    advancesDeduction,
    grossPay,
    totalDeductions,
    netPay,
  };
}
