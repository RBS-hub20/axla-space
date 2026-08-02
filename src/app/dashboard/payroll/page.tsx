import { redirect } from "next/navigation";

/** Axla Payroll lives at /payroll (and /payroll/app), not under the TaxLaya dashboard shell — this just catches anyone following an old/expected /dashboard/payroll link. */
export default function DashboardPayrollRedirect() {
  redirect("/payroll");
}
