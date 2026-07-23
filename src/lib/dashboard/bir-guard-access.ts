import "server-only";
import { getUserPlan } from "@/lib/usage";

/**
 * BIR Guard [BETA] access — PRO/Business only.
 *
 * The original spec's "PRO OR approved waitlist" condition is intentionally
 * not implemented as an OR: every authenticated user in this app already
 * had to have an 'approved' row in public.waitlist just to log in at all
 * (see the gate in src/app/api/auth/send-otp/route.ts) — so "approved
 * waitlist" is always true for anyone who can reach this page, free or
 * paid. Treating it as a real OR would silently give every free-plan user
 * access too, defeating the "FREE users see it blurred" requirement. This
 * checks the plan alone.
 */
export async function hasBirGuardAccess(email: string): Promise<boolean> {
  const plan = await getUserPlan(email);
  return plan !== "free";
}
