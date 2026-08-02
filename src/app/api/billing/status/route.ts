import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getUserPlan } from "@/lib/usage";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { resolveCurrentPeriodEnd, daysLeftUntil } from "@/lib/payments-stats";
import { OWNER_EMAIL } from "@/lib/plans";
import { logError } from "@/lib/log-error";

/**
 * Thin read of the same subscriptions-backed plan every usage limit and
 * upgrade wall in the app already checks (see src/lib/usage.ts). Deliberately
 * NOT a separate is_pro flag — a second, independent "is this user paid"
 * signal is how you end up with a customer who paid and still sees "free"
 * somewhere else in the app.
 *
 * Also includes currentPeriodEnd/daysLeft for the header badge and
 * dashboard subscription-countdown ring — null for free-plan users (no
 * subscription row to read a period from), and also null for the lifetime
 * owner override (isLifetime: true, expires_at: null — no DB round-trip,
 * matching getActivePaidPlan's own bypass in src/lib/usage.ts).
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const isLifetime = user.email.toLowerCase() === OWNER_EMAIL;
  const plan = await getUserPlan(user.email);

  let currentPeriodEnd: string | null = null;
  let daysLeft: number | null = null;
  if (!isLifetime && plan !== "free" && isSupabaseAdminConfigured) {
    const { data, error } = await supabaseAdmin
      .from("subscriptions")
      .select("current_period_start, current_period_end, created_at")
      .eq("email", user.email.toLowerCase())
      .maybeSingle();
    if (error) {
      logError("billing/status: subscription period lookup failed (non-fatal)", error);
    } else if (data) {
      currentPeriodEnd = resolveCurrentPeriodEnd(data);
      daysLeft = daysLeftUntil(currentPeriodEnd);
    }
  }

  return NextResponse.json({ is_pro: plan !== "free", plan, currentPeriodEnd, daysLeft, isLifetime });
}
