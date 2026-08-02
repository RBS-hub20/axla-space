import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getOrCreateProfile } from "@/lib/dashboard/profile";
import { getPayrollPlan } from "@/lib/payroll/plan";
import { ConfirmPayrollCheckout } from "@/components/payroll/ConfirmPayrollCheckout";
import { PayrollAppDashboard } from "@/components/payroll/PayrollAppDashboard";

export const metadata = {
  title: "Axla Payroll — Dashboard",
};

/**
 * Phase 1, owner-only. The `checkout=success` branch is checked BEFORE the
 * subscription gate below — a user who just paid genuinely has no active
 * payroll_subscriptions row yet (that only happens once ConfirmPayrollCheckout's
 * client-side call to /api/payroll/checkout/confirm succeeds), so gating on
 * access first would bounce them straight back to /payroll mid-purchase.
 */
export default async function PayrollAppPage({ searchParams }: { searchParams: { checkout?: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/payroll/app")}`);

  if (searchParams.checkout === "success") {
    return <ConfirmPayrollCheckout />;
  }

  const plan = await getPayrollPlan(user.email);
  if (!plan) redirect("/payroll");

  const profile = await getOrCreateProfile(user.id, user.email, user.name ?? user.email.split("@")[0]);
  const businessName = profile?.business_name?.trim() || profile?.full_name?.trim() || "Your Business";

  return <PayrollAppDashboard businessName={businessName} plan={plan} />;
}
