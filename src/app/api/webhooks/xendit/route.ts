import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

const XENDIT_SECRET_KEY = process.env.XENDIT_SECRET_KEY;
const XENDIT_CALLBACK_TOKEN = process.env.XENDIT_CALLBACK_TOKEN;

/** Xendit auths callbacks via a static `x-callback-token` header (set in their dashboard), not HMAC. */
function verifyXenditToken(header: string | null): boolean {
  if (!XENDIT_CALLBACK_TOKEN || !header) return false;
  const expectedBuf = Buffer.from(XENDIT_CALLBACK_TOKEN);
  const actualBuf = Buffer.from(header);
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

function derivePlan(description: unknown): string {
  return typeof description === "string" && description.toLowerCase().includes("business") ? "business" : "pro";
}

function deriveMethod(channel: unknown): string {
  const value = typeof channel === "string" ? channel.toLowerCase() : "";
  if (value.includes("gcash")) return "gcash";
  if (value.includes("paymaya") || value.includes("maya")) return "maya";
  if (value.includes("card")) return "card";
  return "other";
}

export async function POST(req: Request) {
  // Not configured — ack without processing so Xendit never retries forever
  // against an environment that was never meant to receive its webhooks.
  if (!XENDIT_SECRET_KEY) {
    return NextResponse.json({ received: true, configured: false });
  }

  if (!verifyXenditToken(req.headers.get("x-callback-token"))) {
    logError("webhooks/xendit: callback token mismatch", new Error("invalid or missing token"));
    return NextResponse.json({ error: "Invalid callback token." }, { status: 401 });
  }

  let event: Record<string, unknown>;
  try {
    event = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const status = typeof event.status === "string" ? event.status.toUpperCase() : "";
  const isPaid = status === "PAID" || status === "SETTLED";
  const email = typeof event.payer_email === "string" ? event.payer_email : undefined;
  const amount = Math.round(Number(event.paid_amount ?? event.amount) || 0);
  const plan = derivePlan(event.description);
  const method = deriveMethod(event.payment_channel ?? event.payment_method);
  const currency = typeof event.currency === "string" ? event.currency : "PHP";

  if (!isSupabaseAdminConfigured || !email) {
    return NextResponse.json({ received: true, stored: false });
  }

  try {
    await supabaseAdmin.from("payments").insert({
      email,
      amount,
      currency,
      status: isPaid ? "paid" : "failed",
      provider: "xendit",
      provider_payment_id: typeof event.id === "string" ? event.id : null,
      payment_method: method,
      plan,
    });

    if (isPaid) {
      const now = new Date();
      const periodEnd = new Date(now);
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      await supabaseAdmin.from("subscriptions").upsert(
        {
          email,
          plan,
          status: "active",
          amount,
          provider: "xendit",
          billing_cycle: "monthly",
          current_period_start: now.toISOString(),
          current_period_end: periodEnd.toISOString(),
        },
        { onConflict: "email" },
      );
    }
  } catch (err) {
    logError("webhooks/xendit: DB write failed", err);
  }

  return NextResponse.json({ received: true });
}
