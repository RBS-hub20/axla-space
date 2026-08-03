import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { OWNER_EMAIL } from "@/lib/plans";
import { logError } from "@/lib/log-error";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canViewBilling) {
    return NextResponse.json({ error: "You don't have permission to view billing." }, { status: 403 });
  }

  // Lifetime owner override, no DB round-trip — same bypass as getActivePaidPlan (src/lib/usage.ts).
  if (owner.ownerEmail.toLowerCase() === OWNER_EMAIL) {
    return NextResponse.json({ plan: "business", status: "active", billingCycle: null, currentPeriodEnd: null, isLifetime: true });
  }

  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ plan: "free", status: null, billingCycle: null, currentPeriodEnd: null });
  }

  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("plan, status, billing_cycle, current_period_end")
    .eq("email", owner.ownerEmail.toLowerCase())
    .maybeSingle();

  // No row (never subscribed) and "relation does not exist" (migration not
  // run yet) both mean the same thing from the user's point of view: they're
  // on the free plan. Only a real query error gets a 500.
  if (error && error.code !== "42P01") {
    logError("dashboard/billing: query failed", error);
    return NextResponse.json({ error: "Failed to load billing info." }, { status: 500 });
  }

  return NextResponse.json({
    plan: data?.plan ?? "free",
    status: data?.status ?? null,
    billingCycle: data?.billing_cycle ?? null,
    currentPeriodEnd: data?.current_period_end ?? null,
  });
}
