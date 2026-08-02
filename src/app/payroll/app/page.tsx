import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getOrCreateProfile } from "@/lib/dashboard/profile";
import { getPayrollPlan } from "@/lib/payroll/plan";
import { PAYROLL_PLANS, type PayrollPlan } from "@/lib/payroll/pricing";
import { ConfirmPayrollCheckout } from "@/components/payroll/ConfirmPayrollCheckout";
import { PayrollAppDashboard } from "@/components/payroll/PayrollAppDashboard";

export const metadata = {
  title: "Axla Payroll — Dashboard",
};

function isPayrollPlan(value: string | undefined): value is PayrollPlan {
  return typeof value === "string" && (PAYROLL_PLANS as string[]).includes(value);
}

/**
 * Freemium — every logged-in user lands here and gets a real dashboard, no
 * plan required. `plan` is nullable ("free" tier) and every feature gate
 * lives inside PayrollAppDashboard, not as a page-level redirect. The
 * `checkout=success` branch stays as a defensive fallback for the old
 * full-page redirect flow (e.g. PayMongo's own redirect if the in-app
 * modal's new-tab checkout never got polled successfully) — the primary
 * in-app purchase flow (PayrollCheckoutModal) confirms via polling and
 * never needs this page reload at all.
 */
export default async function PayrollAppPage({ searchParams }: { searchParams: { checkout?: string; plan?: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/payroll/login?next=${encodeURIComponent("/payroll/app")}`);

  if (searchParams.checkout === "success") {
    return <ConfirmPayrollCheckout />;
  }

  const plan = await getPayrollPlan(user.email);
  const profile = await getOrCreateProfile(user.id, user.email, user.name ?? user.email.split("@")[0]);
  const businessName = profile?.business_name?.trim() || profile?.full_name?.trim() || "";

  return (
    <PayrollAppDashboard
      businessName={businessName}
      plan={plan}
      ownerId={user.id}
      autoOpenCheckoutPlan={isPayrollPlan(searchParams.plan) ? searchParams.plan : undefined}
    />
  );
}
