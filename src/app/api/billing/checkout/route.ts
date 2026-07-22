import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createPayMongoCheckoutSession, isPayMongoConfigured } from "@/lib/payments";
import { PLAN_PRICING, type PaidPlan } from "@/lib/plans";
import { getUserPlan } from "@/lib/usage";
import { logError } from "@/lib/log-error";

const SUCCESS_URL = "https://www.axla.space/dashboard/forms?pro=success";
const CANCEL_URL = "https://www.axla.space/dashboard/forms?pro=cancel";

interface CheckoutBody {
  plan?: unknown;
}

function isPaidPlan(value: unknown): value is PaidPlan {
  return value === "pro" || value === "business";
}

/**
 * Checkout entry point for the BIR Forms "Unlock PRO" paywall — uses
 * PayMongo's Checkout Sessions API (via createPayMongoCheckoutSession in
 * src/lib/payments.ts) rather than the Payment Links API the existing
 * /api/dashboard/billing/checkout uses, specifically because Checkout
 * Sessions support a custom success_url — needed for the ?pro=success
 * confetti flow on /dashboard/forms.
 *
 * Price always comes from PLAN_PRICING (real ₱499/mo pro, ₱1,499/mo
 * business) — never a separate/hardcoded amount, and never trusted from the
 * client beyond which of the two real plans they're requesting. The
 * existing /api/webhooks/paymongo already handles the resulting payment
 * (accepting checkout_session.payment.paid) and activates the same
 * subscriptions row getUserPlan() reads everywhere else.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  // Already on a paid plan (pro OR business — business already covers
  // everything pro does) — never create a second, redundant subscription.
  const currentPlan = await getUserPlan(user.email);
  if (currentPlan !== "free") {
    return NextResponse.json({ alreadyPro: true, plan: currentPlan });
  }

  let body: CheckoutBody = {};
  try {
    body = await req.json();
  } catch {
    // No body / invalid JSON — fall through to the "pro" default below,
    // same as before this fix, for backward compat with callers that POST
    // with no payload at all.
  }

  const plan: PaidPlan = isPaidPlan(body.plan) ? body.plan : "pro";

  if (!isPayMongoConfigured) {
    return NextResponse.json({ error: "Payments aren't set up yet. Please try again later." }, { status: 503 });
  }

  const amount = PLAN_PRICING[plan].monthly;
  const planLabel = plan === "business" ? "Business" : "PRO";

  const result = await createPayMongoCheckoutSession({
    email: user.email,
    plan,
    billingCycle: "monthly",
    amount,
    // Matches the exact phrasing the existing /api/webhooks/paymongo's
    // derivePlan() already looks for (`.includes("business")`) — this is
    // the one signal the webhook has for which plan to activate, so it
    // must say "business" verbatim for a business checkout, not just rely
    // on the line item name.
    description: `Axla TaxLaya ${plan} plan (monthly) — unlimited official 2551Q PDF + XML/DAT export + GCash auto-fill`,
    successUrl: SUCCESS_URL,
    cancelUrl: CANCEL_URL,
  });

  if (!result.url) {
    logError("billing/checkout: PayMongo checkout failed", new Error(result.error ?? "unknown"));
    return NextResponse.json({ error: "Couldn't start checkout. Please try again." }, { status: 502 });
  }

  return NextResponse.json({ checkoutUrl: result.url, plan, amount });
}
