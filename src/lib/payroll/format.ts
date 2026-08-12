// Deliberately NOT "server-only" — these are pure display helpers shared
// between PayrollAppDashboard, StaffDetailModal, and any other client
// component that needs to render a peso amount or a masked contact number.

export const PESO = (n: number) => `₱${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export function maskPhone(value: string | null): string {
  if (!value) return "—";
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8) return value;
  return `${digits.slice(0, 4)}****${digits.slice(-4)}`;
}
