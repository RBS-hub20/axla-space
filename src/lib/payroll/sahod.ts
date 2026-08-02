// Deliberately NOT "server-only" — the breakdown shape here is rendered
// directly in the client dashboard (payroll_runs.breakdown jsonb), and the
// withholding-tax estimate is illustrative math with no DB/auth dependency.

export interface StaffAttendanceSummary {
  staffId: string;
  name: string;
  dailyRate: number;
  daysPresent: number;
}

export interface PayrollBreakdownRow extends StaffAttendanceSummary {
  basicPay: number;
}

/** Basic pay only — no overtime, no government-mandated deductions (SSS/PHIC/HDMF), per Phase 1's "basic+OT-less govt" scope. */
export function computeBasicPay(rows: StaffAttendanceSummary[]): PayrollBreakdownRow[] {
  return rows.map((r) => ({ ...r, basicPay: r.dailyRate * r.daysPresent }));
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
