import "server-only";
import { cookies } from "next/headers";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";
import { ADMIN_SESSION_COOKIE, verifySessionToken as verifyAdminPasswordSession } from "@/lib/admin-session";

export const ADMIN_EMAIL = "renzsom2022@gmail.com";

/**
 * Single admin gate for the whole app: the hardcoded founder email, or any
 * profile explicitly flagged `role = 'admin'`. Checked in this order so the
 * founder account never depends on the `profiles.role` column existing.
 */
export async function isAdmin(): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user) return false;
  if (user.email.toLowerCase() === ADMIN_EMAIL) return true;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    logError("isAdmin: profile role lookup failed", error);
    return false;
  }

  return data?.role === "admin";
}

/**
 * Broader admin guard for API routes that both admin surfaces call: the
 * password-gated /admin chat dashboard (axla_admin_session cookie, see
 * src/lib/admin-session.ts) and the /admin/waitlist dashboard (isAdmin()
 * above, keyed off the regular user login). Without this, a route that only
 * checked isAdmin() would 403 every request from someone who's authenticated
 * to /admin via the admin password but hasn't also separately logged in as
 * the founder account through the normal OTP flow — which is exactly why the
 * Approve/Reject buttons on /admin silently did nothing (403, swallowed by
 * the UI) even for a legitimately-authenticated admin.
 */
export async function isAdminRequestAuthorized(): Promise<boolean> {
  const adminPasswordSession = cookies().get(ADMIN_SESSION_COOKIE)?.value;
  if (verifyAdminPasswordSession(adminPasswordSession)) return true;

  return isAdmin();
}
