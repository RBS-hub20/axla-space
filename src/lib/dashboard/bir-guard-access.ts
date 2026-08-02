import "server-only";
import { getUserPlan } from "@/lib/usage";
import { supabaseAdmin } from "@/lib/supabase/admin";

/**
 * BIR Guard case cap per plan — 0 means "can view, can't add" (FREE), null
 * means unlimited (BUSINESS). PRO's cap of 3 is what pushes the "upgrade to
 * Business" modal on a 4th add, distinct from the FREE "upgrade to PRO"
 * paywall.
 */
export const BIR_GUARD_CASE_LIMITS: Record<"free" | "pro" | "business", number | null> = {
  free: 0,
  pro: 3,
  business: null,
};

/**
 * Mutating BIR Guard actions (mark filed, upload screenshot, draft letter)
 * — PRO/Business only. Viewing (GET /api/bir-guard/cases) is intentionally
 * NOT gated by this: FREE users can see their cards/cases (with Total
 * Penalty blurred client-side), they just can't create or edit.
 */
export async function hasBirGuardAccess(email: string): Promise<boolean> {
  const plan = await getUserPlan(email);
  return plan !== "free";
}

/** LOA Tracker and RDO Transfer tabs — BUSINESS plan only, not PRO. */
export async function hasBirGuardBusinessAccess(email: string): Promise<boolean> {
  const plan = await getUserPlan(email);
  return plan === "business";
}

export type CaseLimitCheck =
  | { allowed: true }
  | { allowed: false; code: "UPGRADE_REQUIRED" | "CASE_LIMIT_REACHED"; error: string };

/** Enforces BIR_GUARD_CASE_LIMITS before a new case is inserted. */
export async function checkBirGuardCaseLimit(email: string, userId: string): Promise<CaseLimitCheck> {
  const plan = await getUserPlan(email);
  const limit = BIR_GUARD_CASE_LIMITS[plan];

  if (limit === 0) {
    return { allowed: false, code: "UPGRADE_REQUIRED", error: "BIR Guard case tracking is a PRO feature." };
  }
  if (limit === null) {
    return { allowed: true };
  }

  const { count, error } = await supabaseAdmin
    .from("bir_open_cases")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) throw error;
  if ((count ?? 0) >= limit) {
    return {
      allowed: false,
      code: "CASE_LIMIT_REACHED",
      error: `PRO plan is capped at ${limit} cases — upgrade to Business for unlimited.`,
    };
  }
  return { allowed: true };
}
