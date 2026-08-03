import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

const BUCKET = "payroll-selfies";
const SIGNED_URL_TTL_SECONDS = 3600;
const PAGE_LIMIT = 100;

// Polled every 30s by the admin dashboard — must never serve a cached
// render. See the note in employee/by-token/route.ts for why this is
// declared explicitly rather than relied on implicitly.
export const dynamic = "force-dynamic";

/** Auth required — powers the admin Timekeeping tab's log table. Selfies are stored in a private bucket (see migration 020), so thumbnails are short-lived signed URLs generated here, never a public bucket path. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canViewPayroll) {
    return NextResponse.json({ error: "You don't have permission to view payroll." }, { status: 403 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin
    .from("timekeeping_logs")
    .select("*, payroll_staff(name)")
    .eq("owner_id", owner.ownerId)
    .order("created_at", { ascending: false })
    .limit(PAGE_LIMIT);

  if (error) {
    logError("payroll/timekeeping/logs GET: query failed", error);
    return NextResponse.json({ error: "Failed to load timekeeping logs." }, { status: 500 });
  }

  const rows = data ?? [];
  const selfiePaths = rows.map((r) => r.selfie_path).filter((p): p is string => Boolean(p));
  const signedByPath = new Map<string, string>();
  if (selfiePaths.length > 0) {
    const { data: signed } = await supabaseAdmin.storage.from(BUCKET).createSignedUrls(selfiePaths, SIGNED_URL_TTL_SECONDS);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) signedByPath.set(s.path, s.signedUrl);
    }
  }

  const logs = rows.map((r) => ({
    ...r,
    staff_name: r.payroll_staff?.name ?? "Unknown",
    selfie_url: r.selfie_path ? signedByPath.get(r.selfie_path) ?? null : null,
  }));

  return NextResponse.json({
    logs,
    counts: {
      all: logs.length,
      inside: logs.filter((l) => !l.is_outside).length,
      needsApproval: logs.filter((l) => l.needs_approval).length,
    },
  });
}
