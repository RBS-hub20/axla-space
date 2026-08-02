import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { resend, isResendConfigured, RESEND_FROM_EMAIL } from "@/lib/resend";
import { proUpgradeEmailTemplate, adminNewProNotificationTemplate } from "@/lib/email-templates";
import { ADMIN_EMAIL } from "@/lib/admin";
import { PAYROLL_PLAN_PRICING, type PayrollPlan } from "@/lib/payroll/pricing";
import { logError } from "@/lib/log-error";

const PAYMONGO_SECRET_KEY = process.env.PAYMONGO_SECRET_KEY;
const PAYMONGO_WEBHOOK_SECRET = process.env.PAYMONGO_WEBHOOK_SECRET;

/** PayMongo signs `Paymongo-Signature: t=<ts>,te=<test-sig>,li=<live-sig>` as HMAC-SHA256(secret, `${ts}.${rawBody}`). */
function verifyPaymongoSignature(rawBody: string, header: string | null): boolean {
  if (!PAYMONGO_WEBHOOK_SECRET || !header) return false;

  const parts: Record<string, string> = {};
  for (const pair of header.split(",")) {
    const [key, value] = pair.split("=");
    if (key && value) parts[key] = value;
  }
  const timestamp = parts.t;
  const signature = parts.li || parts.te;
  if (!timestamp || !signature) return false;

  const expected = createHmac("sha256", PAYMONGO_WEBHOOK_SECRET).update(`${timestamp}.${rawBody}`).digest("hex");
  const expectedBuf = Buffer.from(expected, "hex");
  const actualBuf = Buffer.from(signature, "hex");
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

function derivePlan(description: unknown): string {
  return typeof description === "string" && description.toLowerCase().includes("business") ? "business" : "pro";
}

const PAYROLL_EMAIL_PREFIX = "axla-payroll+";

const PAYROLL_PLAN_VALUES = new Set(["starter", "business", "enterprise"]);

/**
 * Metadata first — src/app/api/payroll/checkout sets { product:
 * "axla_payroll", plan, user_id, email } directly on the PayMongo checkout
 * session, so `metadata.plan` is the most direct signal when it survives to
 * the webhook payload. Falls back to the description text ("Axla Payroll —
 * {Label} plan"), then amount — amount alone is NOT reliable: ₱299 is
 * simultaneously Starter's regular price AND Business's promo price
 * (src/lib/payroll/pricing.ts), so an ambiguous amount returns null
 * (skipped, logged) rather than guessing.
 */
function derivePayrollPlan(metadata: Record<string, unknown> | undefined, description: unknown, amount: number): PayrollPlan | null {
  const metaPlan = typeof metadata?.plan === "string" ? metadata.plan : undefined;
  if (metaPlan && PAYROLL_PLAN_VALUES.has(metaPlan)) return metaPlan as PayrollPlan;

  if (typeof description === "string" && description.toLowerCase().includes("axla payroll")) {
    const lower = description.toLowerCase();
    const fromDescription = (["starter", "business", "enterprise"] as const).find((p) => lower.includes(p));
    if (fromDescription) return fromDescription;
  }

  const matches = (["starter", "business", "enterprise"] as const).filter((plan) => {
    const pricing = PAYROLL_PLAN_PRICING[plan];
    return amount === pricing.promo || amount === pricing.regular;
  });
  return matches.length === 1 ? matches[0] : null;
}

/** True when this payment is unambiguously an Axla Payroll purchase — metadata.product is the primary signal, description containing "payroll" is the fallback (per spec), matched in addition to (not instead of) the existing email-prefix check at the call site. */
function isPayrollPayment(metadata: Record<string, unknown> | undefined, description: unknown): boolean {
  if (metadata?.product === "axla_payroll") return true;
  return typeof description === "string" && description.toLowerCase().includes("payroll");
}

function deriveMethod(sourceType: unknown): string {
  const type = typeof sourceType === "string" ? sourceType.toLowerCase() : "";
  if (type.includes("gcash")) return "gcash";
  if (type.includes("paymaya") || type.includes("maya")) return "maya";
  if (type.includes("card")) return "card";
  return "other";
}

interface NestedPaymentData {
  id?: string;
  attributes?: Record<string, unknown>;
}

interface ExtractedPayment {
  paymentId: string | null;
  amountCentavos: number;
  email: string | undefined;
  method: string;
  status: unknown;
  description: unknown;
  metadata: Record<string, unknown> | undefined;
}

/**
 * `payment.paid` events put the payment directly at event.data.attributes.data.
 * `link.payment.paid` events put the LINK there instead, with the actual paid
 * payment nested one level deeper at attributes.payments[0].data — including
 * billing/source, which don't exist on the link's own attributes.
 * `checkout_session.payment.paid` puts the Checkout Session resource there,
 * which carries its own top-level `billing.email` (set at session-creation
 * time in src/lib/payments.ts) and `line_items[].amount` even before the
 * nested `payments[]` array is populated — both checked as fallbacks so a
 * timing edge case where the nested payment isn't embedded yet still
 * resolves email/amount correctly instead of silently degrading to
 * "no email" / "amount 0". Checking every shape (nested first, falling back
 * to top-level, falling back to metadata) means this doesn't silently
 * misparse regardless of which event type triggered it.
 */
function extractPaymentDetails(resource: Record<string, unknown> | undefined): ExtractedPayment {
  const resourceAttrs = (resource?.attributes as Record<string, unknown>) ?? {};
  const nestedPayments = resourceAttrs.payments as Array<{ data?: NestedPaymentData }> | undefined;
  const nestedPayment = nestedPayments?.[0]?.data;
  const nestedAttrs = nestedPayment?.attributes ?? {};

  const billing = (nestedAttrs.billing ?? resourceAttrs.billing) as Record<string, unknown> | undefined;
  const metadata = (nestedAttrs.metadata ?? resourceAttrs.metadata) as Record<string, unknown> | undefined;
  const email =
    (billing?.email as string | undefined) ||
    (resourceAttrs.email as string | undefined) ||
    (metadata?.email as string | undefined) ||
    (resourceAttrs.remarks as string | undefined) ||
    (nestedAttrs.remarks as string | undefined);

  const source = (nestedAttrs.source ?? resourceAttrs.source) as Record<string, unknown> | undefined;

  // Checkout Sessions have no top-level `amount` — only `line_items[].amount`
  // (summed, in case of multiple line items) — checked after the nested
  // payment's amount but before falling back to a bare `resourceAttrs.amount`
  // (which Links/Payments do carry directly). Same reasoning for
  // `description` below it — a Checkout Session has no top-level
  // `description` attribute either (see createPayMongoOneTimeCheckout/
  // createPayMongoCheckoutSession in src/lib/payments.ts, which both only
  // ever set it on the line item), so line_items[0].description is checked
  // as a fallback there too — without it this silently came back undefined
  // for every Checkout Session-sourced payment, TaxLaya's derivePlan() and
  // the Payroll branch's plan lookup below both depend on it actually
  // resolving.
  const lineItems = resourceAttrs.line_items as Array<{ amount?: number; description?: string }> | undefined;
  const lineItemsTotal = Array.isArray(lineItems) ? lineItems.reduce((sum, li) => sum + (Number(li.amount) || 0), 0) : 0;
  const amountCentavos = Number(nestedAttrs.amount) || Number(resourceAttrs.amount) || lineItemsTotal || 0;
  const lineItemDescription = lineItems?.[0]?.description;

  return {
    paymentId: (nestedPayment?.id as string | undefined) ?? (resource?.id as string | undefined) ?? null,
    amountCentavos,
    email,
    method: deriveMethod(source?.type),
    status: nestedAttrs.status ?? resourceAttrs.status,
    description: resourceAttrs.description ?? nestedAttrs.description ?? lineItemDescription,
    metadata,
  };
}

/**
 * PayMongo disables a webhook endpoint after enough non-2xx responses — so
 * this handler ALWAYS returns 200, no matter what happens internally
 * (bad signature, bad JSON, DB errors, email failures, or anything
 * unexpected thrown). A non-2xx here doesn't protect anything: the only
 * consequence is PayMongo retrying, then disabling the endpoint entirely,
 * which silently breaks every future real payment. Errors are still logged
 * (via logError, visible in Vercel logs) so problems remain diagnosable —
 * they just never surface as an HTTP failure status back to PayMongo.
 */
export async function POST(req: Request) {
  try {
    const rawBody = await req.text();

    // Not configured — ack without processing so PayMongo never retries forever
    // against an environment that was never meant to receive its webhooks.
    if (!PAYMONGO_SECRET_KEY) {
      console.error("webhooks/paymongo: PAYMONGO_SECRET_KEY not set — ignoring call");
      return NextResponse.json({ received: true, configured: false });
    }

    const signatureHeader = req.headers.get("paymongo-signature");
    const signatureValid = verifyPaymongoSignature(rawBody, signatureHeader);
    console.log(
      `webhooks/paymongo: call received — webhookSecretConfigured=${Boolean(PAYMONGO_WEBHOOK_SECRET)} signatureHeaderPresent=${Boolean(signatureHeader)} signatureValid=${signatureValid}`,
    );

    if (!signatureValid) {
      logError(
        "webhooks/paymongo: signature verification failed",
        new Error(`header=${signatureHeader ?? "(none)"} webhookSecretConfigured=${Boolean(PAYMONGO_WEBHOOK_SECRET)}`),
      );
      return NextResponse.json({ received: true });
    }

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(rawBody);
    } catch (err) {
      logError("webhooks/paymongo: invalid JSON payload", err);
      return NextResponse.json({ received: true });
    }

    // Full payload, always — this is the ground truth for what PayMongo
    // actually sends (the real shape of link.payment.paid vs payment.paid
    // differs enough between docs and reality that this is worth keeping
    // permanently, not just while debugging this incident).
    console.log("webhooks/paymongo: payload", rawBody);

    const attributes = (event?.data as Record<string, unknown>)?.attributes as Record<string, unknown> | undefined;
    const eventType = attributes?.type as string | undefined;
    const resource = attributes?.data as Record<string, unknown> | undefined;

    console.log(`webhooks/paymongo: eventType=${eventType ?? "(none)"}`);

    // checkout_session.payment.paid added alongside payment./link.payment. for
    // the BIR Forms PRO paywall's Checkout Sessions flow (src/app/api/billing/
    // checkout) — same envelope shape (data.attributes.type / .data), and the
    // Checkout Session resource carries the same `payments` array + `billing`
    // object extractPaymentDetails() below already handles generically. Not
    // independently confirmed against a real payload yet (PayMongo doesn't
    // publish the full nested shape) — the raw-payload log two lines down is
    // there specifically so the first real checkout_session event can be
    // checked in Vercel logs and this adjusted if the shape differs.
    if (
      !eventType ||
      (!eventType.startsWith("payment.") && !eventType.startsWith("link.payment.") && !eventType.startsWith("checkout_session."))
    ) {
      return NextResponse.json({ received: true });
    }

    const details = extractPaymentDetails(resource);
    const isPaid =
      eventType === "payment.paid" ||
      eventType === "link.payment.paid" ||
      eventType === "checkout_session.payment.paid" ||
      details.status === "paid";
    const amount = Math.round(details.amountCentavos / 100);
    const plan = derivePlan(details.description);

    console.log(
      `webhooks/paymongo: parsed paymentId=${details.paymentId ?? "(none)"} email=${details.email ?? "(none)"} amount=${amount} plan=${plan} method=${details.method} isPaid=${isPaid}`,
    );

    if (!isSupabaseAdminConfigured) {
      console.error("webhooks/paymongo: Supabase not configured — not stored");
      return NextResponse.json({ received: true, stored: false });
    }
    if (!details.email) {
      logError("webhooks/paymongo: no email found in payload, cannot record payment", new Error(rawBody));
      return NextResponse.json({ received: true, stored: false });
    }

    // Normalized once, used everywhere below — usage.ts's getActivePaidPlan()
    // (the single source of truth every paywall/upgrade-check in the app
    // reads) always queries subscriptions by lowercased email, so storing
    // anything but lowercase here would silently strand a real paid
    // subscription that never matches on lookup.
    const email = details.email.trim().toLowerCase();

    // Axla Payroll — checked and handled entirely separately, BEFORE any of
    // the TaxLaya pro/business logic below runs, and always returns rather
    // than falling through. Triggered by any of three independent signals
    // (metadata.product, description containing "payroll", or the
    // axla-payroll+ email prefix) — each one alone is already unambiguous
    // for this product (TaxLaya/Negosyo Tracker payments never set
    // metadata, never mention "payroll" in a fixed description string, and
    // Negosyo Tracker never sets an email at all, see the `!details.email`
    // guard above), so combining them is pure resilience, not new risk.
    // This payment's email is itself a synthetic
    // axla-payroll+{timestamp}@axla.space (see src/app/api/payroll/checkout),
    // never a real account address, so this write is purely for admin
    // dashboard visibility (Payroll tab) — real access control for the
    // buyer's actual account already happened via
    // /api/payroll/checkout/confirm and doesn't depend on this at all.
    // Storing plan as "payroll_starter"/"payroll_business"/"payroll_enterprise"
    // (never the bare "pro"/"business" this same table uses for TaxLaya)
    // means getUserPlan()'s exact-string check can never match it either.
    if (email.startsWith(PAYROLL_EMAIL_PREFIX) || isPayrollPayment(details.metadata, details.description)) {
      const payrollPlan = derivePayrollPlan(details.metadata, details.description, amount);
      if (!payrollPlan) {
        logError("webhooks/paymongo: payroll payment with unrecognized amount", new Error(`email=${email} amount=${amount}`));
        return NextResponse.json({ received: true, stored: false });
      }
      const subscriptionPlan = `payroll_${payrollPlan}`;

      try {
        const { error: payrollInsertError } = await supabaseAdmin.from("payments").insert({
          email,
          amount,
          currency: "PHP",
          status: isPaid ? "paid" : "failed",
          provider: "paymongo",
          provider_payment_id: details.paymentId,
          payment_method: details.method,
          plan: subscriptionPlan,
          product: "axla_payroll",
        });
        if (payrollInsertError) logError("webhooks/paymongo: payroll payments insert failed", payrollInsertError);

        if (isPaid) {
          const now = new Date();
          const nextBilling = new Date(now.getTime() + 30 * 86_400_000);

          const { error: payrollSubError } = await supabaseAdmin.from("subscriptions").upsert(
            {
              email,
              plan: subscriptionPlan,
              status: "active",
              amount,
              provider: "paymongo",
              billing_cycle: "monthly",
              current_period_start: now.toISOString(),
              current_period_end: nextBilling.toISOString(),
            },
            { onConflict: "email" },
          );
          if (payrollSubError) logError("webhooks/paymongo: payroll subscriptions upsert failed", payrollSubError);
          else console.log(`webhooks/paymongo: payroll subscriptions upserted — email=${email} plan=${subscriptionPlan} amount=${amount}`);

          // Real access-control activation, redundant with (not instead of)
          // /api/payroll/checkout/confirm's polling-based flow — a resilience
          // backup for the rare case a buyer closes the checkout tab before
          // the modal's poll catches the "paid" state. Only runs when
          // metadata.user_id is present, which is only ever true for
          // payments this app's own /api/payroll/checkout created (never
          // client-suppliable), so this is as trustworthy as the confirm
          // route's own lookup.
          const realUserId = typeof details.metadata?.user_id === "string" ? details.metadata.user_id : null;
          const realEmail = typeof details.metadata?.email === "string" ? details.metadata.email.toLowerCase() : email;
          if (realUserId) {
            const { error: realSubError } = await supabaseAdmin.from("payroll_subscriptions").upsert(
              {
                user_id: realUserId,
                email: realEmail,
                plan: payrollPlan,
                status: "active",
                price: amount,
                product: "axla_payroll",
                next_billing: nextBilling.toISOString(),
                updated_at: now.toISOString(),
              },
              { onConflict: "user_id" },
            );
            if (realSubError) logError("webhooks/paymongo: payroll_subscriptions upsert failed", realSubError);
            else console.log(`webhooks/paymongo: payroll_subscriptions upserted (real access) — user_id=${realUserId} plan=${payrollPlan}`);
          }
        }
      } catch (err) {
        logError("webhooks/paymongo: payroll DB write threw", err);
      }

      return NextResponse.json({ received: true, product: "axla_payroll" });
    }

    try {
      const { error: insertError } = await supabaseAdmin.from("payments").insert({
        email,
        amount,
        currency: "PHP",
        status: isPaid ? "paid" : "failed",
        provider: "paymongo",
        provider_payment_id: details.paymentId,
        payment_method: details.method,
        plan,
      });
      if (insertError) logError("webhooks/paymongo: payments insert failed", insertError);

      if (isPaid) {
        const now = new Date();
        const periodEnd = new Date(now);
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        const { error: subError } = await supabaseAdmin.from("subscriptions").upsert(
          {
            email,
            plan,
            status: "active",
            amount,
            provider: "paymongo",
            billing_cycle: "monthly",
            current_period_start: now.toISOString(),
            current_period_end: periodEnd.toISOString(),
          },
          { onConflict: "email" },
        );
        if (subError) logError("webhooks/paymongo: subscriptions upsert failed", subError);
        else {
          console.log(`webhooks/paymongo: subscriptions upserted — email=${email} plan=${plan} amount=${amount}`);
          // Jarvis has no cache/memory to refresh — gatherStats() in
          // src/app/api/admin/jarvis/route.ts queries subscriptions/payments
          // live on every request, so this log is purely for visibility into
          // when a new PRO subscription landed, not a trigger Jarvis depends on.
          console.log(`New PRO: ${email}`);
        }

        // Both sends below are best-effort — a failed send should never
        // affect the actual subscription activation above, which has
        // already happened, and one send failing shouldn't block the other.
        if (isResendConfigured) {
          const receipt = { transactionId: details.paymentId, amount, date: now };

          try {
            const { data: profile } = await supabaseAdmin.from("profiles").select("full_name").eq("email", email).maybeSingle();
            const { error: sendError } = await resend.emails.send({
              from: RESEND_FROM_EMAIL,
              to: email,
              subject: "Welcome to Axla PRO! 🚀",
              html: proUpgradeEmailTemplate(profile?.full_name || email.split("@")[0], plan as "pro" | "business", receipt),
            });
            if (sendError) logError("webhooks/paymongo: pro-upgrade email send failed (non-fatal)", sendError);
            else console.log(`webhooks/paymongo: pro-upgrade receipt email sent to ${email}`);
          } catch (err) {
            logError("webhooks/paymongo: pro-upgrade email send threw (non-fatal)", err);
          }

          try {
            const { error: adminSendError } = await resend.emails.send({
              from: RESEND_FROM_EMAIL,
              to: ADMIN_EMAIL,
              subject: `New ${plan === "business" ? "Business" : "PRO"} purchase: ${email} — ₱${amount.toLocaleString()}`,
              html: adminNewProNotificationTemplate(email, plan as "pro" | "business", amount, details.paymentId),
            });
            if (adminSendError) logError("webhooks/paymongo: admin notification email send failed (non-fatal)", adminSendError);
            else console.log(`webhooks/paymongo: admin notification email sent for ${email}`);
          } catch (err) {
            logError("webhooks/paymongo: admin notification email send threw (non-fatal)", err);
          }
        }
      }
    } catch (err) {
      logError("webhooks/paymongo: DB write threw", err);
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    // Last-resort catch-all — nothing above should throw uncaught, but if it
    // ever does, PayMongo still gets a 200 rather than a 500 that could get
    // this endpoint disabled.
    logError("webhooks/paymongo: unexpected top-level error", err);
    return NextResponse.json({ received: true });
  }
}
