import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { createPayMongoCheckoutLink, createXenditInvoice, isPayMongoConfigured, isXenditConfigured } from "@/lib/payments";
import { PLAN_PRICING, type BillingCycle, type PaidPlan } from "@/lib/plans";
import { PROMO, isPromoActive } from "@/lib/promo";
import { logError } from "@/lib/log-error";

interface CheckoutBody {
  plan?: unknown;
  billingCycle?: unknown;
  promoCode?: unknown;
}

function isPaidPlan(value: unknown): value is PaidPlan {
  return value === "pro" || value === "business";
}

function isBillingCycle(value: unknown): value is BillingCycle {
  return value === "monthly" || value === "yearly";
}

/**
 * Creates a checkout link/invoice for the signed-in user to upgrade. The
 * amount is always looked up server-side from PLAN_PRICING — never trust a
 * client-supplied amount for anything that charges money.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: CheckoutBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!isPaidPlan(body.plan)) {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }
  if (!isBillingCycle(body.billingCycle)) {
    return NextResponse.json({ error: "Invalid billing cycle." }, { status: 400 });
  }

  const plan = body.plan;
  const billingCycle = body.billingCycle;

  // Same LAUNCH50 rule as /api/billing/checkout, both reading from the one
  // shared src/lib/promo.ts — PRO monthly only, never trust a client-
  // supplied amount, only whether the code+plan+cycle+expiry are valid.
  const promoApplied =
    typeof body.promoCode === "string" &&
    body.promoCode === PROMO.code &&
    plan === "pro" &&
    billingCycle === "monthly" &&
    isPromoActive();
  const amount = promoApplied ? PROMO.proPricePesos : PLAN_PRICING[plan][billingCycle];

  if (promoApplied) {
    console.log(`dashboard/billing/checkout: LAUNCH50 promo applied — email=${user.email} plan=${plan} amount=${amount}`);
  }

  const params = { email: user.email, plan, billingCycle, amount };

  if (isPayMongoConfigured) {
    const result = await createPayMongoCheckoutLink(params);
    if (result.url) {
      return NextResponse.json({ url: result.url, provider: "paymongo", amount, promoApplied });
    }
    logError("dashboard/billing/checkout: PayMongo checkout failed", new Error(result.error ?? "unknown"));
  }

  if (isXenditConfigured) {
    const result = await createXenditInvoice(params);
    if (result.url) {
      return NextResponse.json({ url: result.url, provider: "xendit", amount, promoApplied });
    }
    logError("dashboard/billing/checkout: Xendit checkout failed", new Error(result.error ?? "unknown"));
  }

  return NextResponse.json({ error: "Payments aren't set up yet. Please try again later." }, { status: 503 });
}
