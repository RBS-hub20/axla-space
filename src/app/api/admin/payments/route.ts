import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/admin-session";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { aggregatePayments, buildMockPaymentsPayload } from "@/lib/payments-stats";
import { logError } from "@/lib/log-error";

export async function GET() {
  const session = cookies().get(ADMIN_SESSION_COOKIE)?.value;
  if (!verifySessionToken(session)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isSupabaseAdminConfigured) {
    return NextResponse.json(buildMockPaymentsPayload());
  }

  const [paymentsResult, subscriptionsResult] = await Promise.all([
    supabaseAdmin
      .from("payments")
      .select("id, email, amount, currency, status, provider, payment_method, plan, created_at")
      .order("created_at", { ascending: false })
      .limit(500),
    supabaseAdmin
      .from("subscriptions")
      .select("email, plan, status, amount, provider, billing_cycle, current_period_start, current_period_end, created_at"),
  ]);

  // Falls back to mock data on a query error too (not just "no rows yet") —
  // the most common cause is migrations/005_payments_subscriptions.sql not
  // having been run yet, and the dashboard should still render usefully
  // rather than showing a hard error for what's really just a setup step.
  if (paymentsResult.error || subscriptionsResult.error) {
    logError(
      "admin/payments: query failed, falling back to mock data (has 005_payments_subscriptions.sql been run?)",
      paymentsResult.error || subscriptionsResult.error,
    );
    return NextResponse.json(buildMockPaymentsPayload());
  }

  const payments = paymentsResult.data ?? [];
  const subscriptions = subscriptionsResult.data ?? [];

  if (payments.length === 0 && subscriptions.length === 0) {
    return NextResponse.json(buildMockPaymentsPayload());
  }

  return NextResponse.json(aggregatePayments(payments, subscriptions));
}
