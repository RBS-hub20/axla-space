import "server-only";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getOrCreateProfile } from "@/lib/dashboard/profile";
import { getBusinesses, createBusiness } from "@/lib/dashboard/businesses";
import { logError } from "@/lib/log-error";

const TRIAL_DAYS = 30;

/**
 * Free signup launch: runs once, right after a brand-new user's first OTP
 * verification (see verify-otp/route.ts) — never for a returning user's
 * later logins. Best-effort and non-blocking on purpose: any failure here
 * is logged but never fails the login response itself, same fail-open
 * reasoning as every other non-critical write in this codebase (e.g.
 * logActivity). A user who somehow doesn't get a business auto-created
 * still gets the fallback synthetic-business behavior already built into
 * resolveBusiness() elsewhere, so this is a nice-to-have (zero empty
 * state), not a hard dependency for the account to work.
 *
 * Two things happen:
 *  1. profiles + a default primary business get created immediately
 *     (previously lazy, first-dashboard-visit only) — free tier, real
 *     limits are enforced separately in src/lib/usage.ts, unchanged here.
 *  2. If this email has a row in the (no-longer-gating) waitlist table,
 *     grant a 30-day Pro trial by upserting `subscriptions` — the exact
 *     same table/shape every real PayMongo payment activates, so every
 *     other plan check in the app (getUserPlan, checkAndIncrementUsage)
 *     honors this identically to a real paid Pro subscription until it
 *     expires. Only ever grants a trial into a currently-unpaid account —
 *     never overwrites an existing active subscription.
 */
export async function provisionNewSignup(userId: string, email: string, friendlyName: string): Promise<void> {
  if (!isSupabaseAdminConfigured) return;

  try {
    const profile = await getOrCreateProfile(userId, email, friendlyName);
    if (!profile) return;

    const existingBusinesses = await getBusinesses(userId);
    if (existingBusinesses.length === 0) {
      const { error } = await createBusiness(userId, { name: `${friendlyName}'s Business` });
      if (error) logError("provisionNewSignup: createBusiness failed", error);
    }
  } catch (err) {
    logError("provisionNewSignup: profile/business provisioning failed", err);
  }

  try {
    const normalizedEmail = email.toLowerCase();

    const { data: waitlistEntry, error: waitlistError } = await supabaseAdmin
      .from("waitlist")
      .select("email")
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (waitlistError) {
      logError("provisionNewSignup: waitlist lookup failed", waitlistError);
      return;
    }
    if (!waitlistEntry) return;

    const { data: existingSub, error: subLookupError } = await supabaseAdmin
      .from("subscriptions")
      .select("status")
      .eq("email", normalizedEmail)
      .maybeSingle();
    if (subLookupError) {
      logError("provisionNewSignup: subscription lookup failed", subLookupError);
      return;
    }
    if (existingSub?.status === "active") return; // never overwrite a real active plan

    const now = new Date();
    const trialEnd = new Date(now);
    trialEnd.setDate(trialEnd.getDate() + TRIAL_DAYS);

    const { error: upsertError } = await supabaseAdmin.from("subscriptions").upsert(
      {
        email: normalizedEmail,
        plan: "pro",
        status: "active",
        amount: 0,
        provider: "trial",
        billing_cycle: "monthly",
        current_period_start: now.toISOString(),
        current_period_end: trialEnd.toISOString(),
      },
      { onConflict: "email" },
    );
    if (upsertError) logError("provisionNewSignup: trial subscription upsert failed", upsertError);
  } catch (err) {
    logError("provisionNewSignup: waitlist trial grant failed", err);
  }
}
