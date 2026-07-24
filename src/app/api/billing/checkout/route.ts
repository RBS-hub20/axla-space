import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createPayMongoCheckoutSession, isPayMongoConfigured } from "@/lib/payments";
import { PLAN_PRICING, type PaidPlan } from "@/lib/plans";
import { getUserPlan } from "@/lib/usage";
import { PROMO, isPromoActive } from "@/lib/promo";
import { logError } from "@/lib/log-error";

const SUCCESS_URL = "https://www.axla.space/dashboard/forms?pro=success";
const CANCEL_URL = "https://www.axla.space/dashboard/forms?pro=cancel";

interface CheckoutBody {
  plan?: unknown;
  promoCode?: unknown;
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

  // PRO only, per explicit scope — Business isn't discounted by this promo.
  // Never trust a client-supplied amount, only whether the code+expiry are
  // valid; the actual charged amount always comes from PROMO/PLAN_PRICING.
  const promoApplied = typeof body.promoCode === "string" && body.promoCode === PROMO.code && plan === "pro" && isPromoActive();
  const amount = promoApplied ? PROMO.proPricePesos : PLAN_PRICING[plan].monthly;

  if (promoApplied) {
    console.log(`billing/checkout: LAUNCH50 promo applied — email=${user.email} plan=${plan} amount=${amount}`);
  }

  const result = await createPayMongoCheckoutSession({
    email: user.email,
    plan,
    billingCycle: "monthly",
    amount,
    // Matches the exact phrasing the existing /api/webhooks/paymongo's
    // derivePlan() already looks for (`.includes("business")`) — this is
    // the one signal the webhook has for which plan to activate, so it
    // must say "business" verbatim for a business checkout, not just rely
    // on the line item name. Promo code included here too so it's visible
    // in the resulting payment record (payments.description) for tracking
    // usage, since PayMongo's Checkout Sessions API doesn't expose a
    // separate arbitrary metadata field this app currently reads back.
    description: promoApplied
      ? `Axla TaxLaya ${plan} plan (monthly) — LAUNCH50 promo (50% off) — unlimited official 2551Q PDF + XML/DAT export + GCash auto-fill`
      : `Axla TaxLaya ${plan} plan (monthly) — unlimited official 2551Q PDF + XML/DAT export + GCash auto-fill`,
    successUrl: SUCCESS_URL,
    cancelUrl: CANCEL_URL,
  });

  if (!result.url) {
    logError("billing/checkout: PayMongo checkout failed", new Error(result.error ?? "unknown"));
    // "No payment methods are available" surfaces when every type in
    // payment_method_types happens to be inactive on the account (e.g.
    // gcash-direct/card still pending DTI approval) — a friendlier,
    // actionable message than PayMongo's raw error, in Taglish per the
    // rest of the paywall copy.
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

  return NextResponse.json({ checkoutUrl: result.url, plan, amount, promoApplied });
}
