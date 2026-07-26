import { NextResponse } from "next/server";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { resend, isResendConfigured, RESEND_FROM_EMAIL } from "@/lib/resend";
import { subscriptionExpiryEmailTemplate, subscriptionExpirySubject, type ExpiryReminderTier } from "@/lib/email-templates";
import { resolveCurrentPeriodEnd, daysLeftUntil, type RawSubscriptionRow } from "@/lib/payments-stats";
import { logError } from "@/lib/log-error";

/** Exact-day thresholds, not ranges — this cron runs once daily, so a range (e.g. daysLeft <= 3) would re-send the same tier on every subsequent day instead of once. */
function tierForDaysLeft(daysLeft: number): ExpiryReminderTier | null {
  if (daysLeft === 3) return "3-day";
  if (daysLeft === 1) return "1-day";
  if (daysLeft === 0) return "expired";
  return null;
}

/**
 * Daily cron (see vercel.json) — checks every active subscription's
 * current_period_end and sends a renewal-reminder email at exactly 3 days
 * left, 1 day left, and the day it expires (day 0). A subscriber who
 * doesn't renew stays on the Free plan afterward (enforced by
 * usage.ts's getActivePaidPlan, which already treats a non-"active" status
 * or a plain elapsed period as free-tier) — this cron only sends the
 * reminder emails, it doesn't itself flip subscriptions to expired.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET isn't configured." }, { status: 503 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("email, plan, status, amount, provider, billing_cycle, current_period_start, current_period_end, created_at")
    .eq("status", "active");

  if (error) {
    logError("cron/check-expiry: subscriptions query failed", error);
    return NextResponse.json({ error: "Failed to load subscriptions." }, { status: 500 });
  }

  const subscriptions = (data ?? []) as RawSubscriptionRow[];
  let checked = 0;
  let sent = 0;
  let failed = 0;

  for (const sub of subscriptions) {
    checked++;
    const currentPeriodEnd = resolveCurrentPeriodEnd(sub);
    const daysLeft = daysLeftUntil(currentPeriodEnd);
    const tier = tierForDaysLeft(daysLeft);
    if (!tier) continue;

    console.log(`cron/check-expiry: ${sub.email} — tier=${tier} daysLeft=${daysLeft} periodEnd=${currentPeriodEnd}`);

    if (!isResendConfigured) continue;

    try {
      const { data: profile } = await supabaseAdmin.from("profiles").select("full_name").eq("email", sub.email).maybeSingle();
      const expiryDateLabel = new Date(currentPeriodEnd).toLocaleDateString("en-PH", {
        month: "long",
        day: "numeric",
        year: "numeric",
      });
      const plan = sub.plan === "business" ? "business" : "pro";

      const { error: sendError } = await resend.emails.send({
        from: RESEND_FROM_EMAIL,
        to: sub.email,
        subject: subscriptionExpirySubject(tier),
        html: subscriptionExpiryEmailTemplate(profile?.full_name || sub.email.split("@")[0], tier, expiryDateLabel, plan),
      });

      if (sendError) {
        failed++;
        logError(`cron/check-expiry: send failed for ${sub.email} (non-fatal, continuing)`, sendError);
      } else {
        sent++;
      }
    } catch (err) {
      failed++;
      logError(`cron/check-expiry: send threw for ${sub.email} (non-fatal, continuing)`, err);
    }
  }

  return NextResponse.json({ checked, sent, failed });
}
