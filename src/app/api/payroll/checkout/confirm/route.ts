import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getPayMongoCheckoutSessionStatus, isPayMongoConfigured } from "@/lib/payments";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { PAYROLL_PLANS, type PayrollPlan } from "@/lib/payroll/pricing";
import { logError } from "@/lib/log-error";

interface ConfirmBody {
  checkoutSessionId?: unknown;
}

/** Derives the plan from PayMongo's own checkout-session description — never from the client's request body — see /api/payroll/checkout's docstring for why. */
function derivePlanFromDescription(description: string | null): PayrollPlan | null {
  if (!description || !description.toLowerCase().includes("axla payroll")) return null;
  const lower = description.toLowerCase();
  return PAYROLL_PLANS.find((p) => lower.includes(p)) ?? null;
}

/**
 * Records one payments-ledger row for a Payroll purchase, keyed on the
 * PayMongo payment id so a repeated confirm call (e.g. the user refreshing
 * /payroll/app?checkout=success) never double-counts revenue — same
 * idempotency pattern as Negosyo Tracker's recordSaleOnce.
 */
async function recordPaymentOnce(paymentId: string | null, email: string, amount: number, plan: PayrollPlan) {
  if (paymentId) {
    const { data: existing } = await supabaseAdmin.from("payments").select("id").eq("provider_payment_id", paymentId).maybeSingle();
    if (existing) return;
  }
  const { error } = await supabaseAdmin.from("payments").insert({
    email,
    amount,
    currency: "PHP",
    status: "paid",
    provider: "paymongo",
    provider_payment_id: paymentId,
    payment_method: null,
    plan,
    product: "axla_payroll",
  });
  if (error) logError("payroll/checkout/confirm: payments insert failed (non-fatal)", error);
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isPayMongoConfigured) {
    return NextResponse.json({ error: "Payments aren't set up yet." }, { status: 503 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  let body: ConfirmBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const checkoutSessionId = typeof body.checkoutSessionId === "string" ? body.checkoutSessionId.trim() : "";
  if (!checkoutSessionId) {
    return NextResponse.json({ error: "Missing checkout session." }, { status: 400 });
  }

  const status = await getPayMongoCheckoutSessionStatus(checkoutSessionId);
  if (!status.paid) {
    return NextResponse.json({ paid: false, error: "Payment not yet confirmed." }, { status: 402 });
  }

  const plan = derivePlanFromDescription(status.description);
  if (!plan) {
    logError(
      "payroll/checkout/confirm: paid session doesn't look like an Axla Payroll purchase",
      new Error(`checkoutSessionId=${checkoutSessionId} description=${status.description ?? "(none)"}`),
    );
    return NextResponse.json({ paid: false, error: "This checkout session isn't an Axla Payroll purchase." }, { status: 400 });
  }

  const email = user.email.trim().toLowerCase();
  const now = new Date();
  const nextBilling = new Date(now);
  nextBilling.setMonth(nextBilling.getMonth() + 1);

  const { error: subError } = await supabaseAdmin.from("payroll_subscriptions").upsert(
    {
      user_id: user.id,
      email,
      plan,
      status: "active",
      price: status.amountPesos,
      product: "axla_payroll",
      next_billing: nextBilling.toISOString(),
      updated_at: now.toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (subError) {
    logError("payroll/checkout/confirm: payroll_subscriptions upsert failed", subError);
    return NextResponse.json({ error: "Payment confirmed but activation failed — contact support." }, { status: 500 });
  }

  await recordPaymentOnce(status.paymentId, email, status.amountPesos, plan);

  return NextResponse.json({ paid: true, plan });
}
