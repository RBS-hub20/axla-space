import { NextResponse } from "next/server";
import { isAdminRequestAuthorized } from "@/lib/admin";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

interface ReconcileBody {
  email?: unknown;
  plan?: unknown;
  status?: unknown;
  amount?: unknown;
  provider?: unknown;
  providerPaymentId?: unknown;
  paymentMethod?: unknown;
}

const VALID_STATUSES = ["active", "past_due", "canceled", "trial"];

/**
 * Manual admin override: upserts a subscription (and, for an active
 * reactivation, a matching payment row) directly — the escape hatch for
 * exactly this kind of incident, where a real payment happened but the
 * webhook that should have recorded it never arrived.
 */
export async function POST(req: Request) {
  if (!(await isAdminRequestAuthorized())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }

  let body: ReconcileBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  const plan = body.plan === "business" ? "business" : "pro";
  const status = VALID_STATUSES.includes(body.status as string) ? (body.status as string) : "active";
  const amount = Number(body.amount) || (plan === "business" ? 1499 : 499);
  const provider = body.provider === "xendit" ? "xendit" : "paymongo";
  const providerPaymentId = typeof body.providerPaymentId === "string" ? body.providerPaymentId : null;
  const paymentMethod = typeof body.paymentMethod === "string" ? body.paymentMethod : null;

  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  const { error: subError } = await supabaseAdmin.from("subscriptions").upsert(
    {
      email,
      plan,
      status,
      amount,
      provider,
      billing_cycle: "monthly",
      current_period_start: now.toISOString(),
      current_period_end: periodEnd.toISOString(),
    },
    { onConflict: "email" },
  );
  if (subError) {
    logError("admin/subscribers/reconcile: subscription upsert failed", subError);
    return NextResponse.json({ error: "Failed to update subscription." }, { status: 500 });
  }

  if (status === "active") {
    const { error: payError } = await supabaseAdmin.from("payments").insert({
      email,
      amount,
      currency: "PHP",
      status: "paid",
      provider,
      provider_payment_id: providerPaymentId,
      payment_method: paymentMethod,
      plan,
    });
    // Non-fatal: the subscription is already correct even if this log entry fails.
    if (payError) logError("admin/subscribers/reconcile: payment insert failed", payError);
  }

  return NextResponse.json({ success: true });
}
