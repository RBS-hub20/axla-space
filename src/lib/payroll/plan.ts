import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { OWNER_EMAIL } from "@/lib/plans";
import type { PayrollPlan } from "@/lib/payroll/pricing";

export type { PayrollPlan };

/**
 * Same owner-override shape as getActivePaidPlan in src/lib/usage.ts — this
 * single hardcoded email always resolves as lifetime Enterprise for Axla
 * Payroll too, no DB round-trip, checked first before any subscription
 * lookup. Every other email is read from payroll_subscriptions, active
 * status only (a canceled/past_due plan falls back to no access, same
 * "only an active row counts" rule as the TaxLaya subscriptions table).
 */
export async function getPayrollPlan(email: string): Promise<PayrollPlan | null> {
  if (email.toLowerCase() === OWNER_EMAIL) return "enterprise";

  const { data, error } = await supabaseAdmin
    .from("payroll_subscriptions")
    .select("plan, status")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (error || !data) return null;
  if (data.status !== "active") return null;
  return data.plan as PayrollPlan;
}

export async function hasPayrollAccess(email: string): Promise<boolean> {
  return (await getPayrollPlan(email)) !== null;
}
