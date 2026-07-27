import { NextResponse } from "next/server";
import { createPayMongoOneTimeCheckout, isPayMongoConfigured } from "@/lib/payments";
import { logError } from "@/lib/log-error";

const SUCCESS_URL = "https://www.axla.space/negosyo-tracker/create?paid=1";
const CANCEL_URL = "https://www.axla.space/negosyo-tracker/create?step=3&cancelled=1";

// Real price of the product — never trusted from the client beyond which
// business name to put in the description, same convention as
// /api/billing/checkout (PLAN_PRICING is the source of truth there; here
// there's only one price, so it's just a constant).
const NEGOSYO_TRACKER_PRICE_PESOS = 149;

interface CheckoutBody {
  businessName?: unknown;
}

export async function POST(req: Request) {
  if (!isPayMongoConfigured) {
    return NextResponse.json({ error: "Payments aren't set up yet. Please try again later." }, { status: 503 });
  }

  let body: CheckoutBody = {};
  try {
    body = await req.json();
  } catch {
    // fall through — businessName defaults below
  }

  const businessName =
    typeof body.businessName === "string" && body.businessName.trim() ? body.businessName.trim().slice(0, 80) : "Negosyo";

  const result = await createPayMongoOneTimeCheckout({
    amountPesos: NEGOSYO_TRACKER_PRICE_PESOS,
    description: `Negosyo Tracker - ${businessName}`,
    successUrl: SUCCESS_URL,
    cancelUrl: CANCEL_URL,
  });

  if (!result.url || !result.checkoutSessionId) {
    logError("paymongo/create-negosyo-checkout: PayMongo checkout failed", new Error(result.error ?? "unknown"));
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

  return NextResponse.json({ checkoutUrl: result.url, checkoutSessionId: result.checkoutSessionId, amount: NEGOSYO_TRACKER_PRICE_PESOS });
}
