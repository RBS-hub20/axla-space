// Deliberately NOT "server-only" — these are pure display helpers shared
// between PayrollAppDashboard, StaffDetailModal, and any other client
// component that needs to render a peso amount or a masked contact number.

import { RATE_TYPES, type RateType } from "@/lib/payroll/staff-fields";

/** Guards against NaN ever reaching the screen as "₱NaN" — e.g. a numeric column that's temporarily undefined (column not yet migrated) or a Supabase numeric coming back as a non-numeric string. */
export const PESO = (n: number) => {
  const value = Number(n);
  return Number.isFinite(value) ? `₱${value.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "₱0";
};

export function maskPhone(value: string | null): string {
  if (!value) return "—";
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8) return value;
  return `${digits.slice(0, 4)}****${digits.slice(-4)}`;
}

/**
 * Rate amount can arrive as a number, a numeric string, null, or undefined
 * (e.g. rate_amount is missing on a row from before migration 027 backfilled
 * it) — this resolves the real display value with a daily_rate fallback,
 * and returns 0 (never NaN) when nothing usable is present.
 */
export function resolveRateAmount(rateAmount: unknown, dailyRate: unknown): number {
  const raw = rateAmount ?? dailyRate;
  if (raw === null || raw === undefined || raw === "") return 0;
  const n = typeof raw === "string" ? parseFloat(raw) : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function resolveRateType(rateType: unknown): RateType {
  return typeof rateType === "string" && (RATE_TYPES as readonly string[]).includes(rateType) ? (rateType as RateType) : "daily";
}
