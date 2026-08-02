import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createPayMongoOneTimeCheckout, isPayMongoConfigured } from "@/lib/payments";
import { PAYROLL_PLANS, PAYROLL_PLAN_PRICING, PAYROLL_PLAN_LABELS, type PayrollPlan } from "@/lib/payroll/pricing";
import { isPayrollPromoActive } from "@/lib/payroll/promo";
import { logError } from "@/lib/log-error";

const SUCCESS_URL = "https://www.axla.space/payroll/app?checkout=success";
const CANCEL_URL = "https://www.axla.space/payroll?checkout=cancelled";

interface CheckoutBody {
  plan?: unknown;
}

function isPayrollPlan(value: unknown): value is PayrollPlan {
  return typeof value === "string" && (PAYROLL_PLANS as string[]).includes(value);
}

/**
 * Login-gated, same as /api/billing/checkout for TaxLaya Pro/Business — a
 * Payroll subscription must always be tied to a real account from the
 * start, no anonymous-then-claim-later flow.
 *
 * Uses createPayMongoOneTimeCheckout with a synthetic
 * axla-payroll+{timestamp}@axla.space `email` — NOT the buyer's real
 * address — purely so /api/webhooks/paymongo's dedicated early payroll
 * branch can record this payment into the shared payments/subscriptions
 * tables for admin-dashboard visibility (Payroll tab). Real access control
 * never depends on that: it's confirmed synchronously at
 * /api/payroll/checkout/confirm once the user is redirected back (same
 * verified-status pattern already proven for Negosyo Tracker), which is
 * what actually activates payroll_subscriptions and is tied to the real
 * logged-in account, not this placeholder.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isPayMongoConfigured) {
    return NextResponse.json({ error: "Payments aren't set up yet. Please try again later." }, { status: 503 });
  }

  let body: CheckoutBody = {};
  try {
    body = await req.json();
  } catch {
    // fall through — validated below
  }

  if (!isPayrollPlan(body.plan)) {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }
  const plan = body.plan;

  const promoApplied = isPayrollPromoActive();
  const amount = promoApplied ? PAYROLL_PLAN_PRICING[plan].promo : PAYROLL_PLAN_PRICING[plan].regular;

  // "Axla Payroll" must appear verbatim — /api/payroll/checkout/confirm
  // matches on it to authoritatively re-derive the plan from PayMongo's own
  // record rather than trusting anything the client sends back at confirm.
  const description = `Axla Payroll — ${PAYROLL_PLAN_LABELS[plan]} plan (monthly)${promoApplied ? " — Launch Promo 50% OFF" : ""}`;

  const result = await createPayMongoOneTimeCheckout({
    amountPesos: amount,
    description,
    successUrl: SUCCESS_URL,
    cancelUrl: CANCEL_URL,
    email: `axla-payroll+${Date.now()}@axla.space`,
  });

  if (!result.url || !result.checkoutSessionId) {
    logError("payroll/checkout: PayMongo checkout failed", new Error(result.error ?? "unknown"));
    const noMethodsAvailable = /no payment method/i.test(result.error ?? "");
    return NextResponse.json(
      {
        error: noMethodsAvailable
          ? "Payment method activating pa — please try QRPh, or email hello@axla.space kung need mo ng tulong."
          : "Couldn't start checkout. Please try again.",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ checkoutUrl: result.url, checkoutSessionId: result.checkoutSessionId, plan, amount });
}
