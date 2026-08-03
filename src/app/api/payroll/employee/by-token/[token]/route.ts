import { NextResponse } from "next/server";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { checkPayrollTokenRateLimit, getClientIp } from "@/lib/payroll/rate-limit";
import { logError } from "@/lib/log-error";

// This route has no auth check (public, token-only) — nothing here calls a
// dynamic API like cookies(), so without this Next.js treats it as a
// static-rendering candidate and caches the underlying Supabase fetch()
// calls indefinitely. Every other payroll route is exempted from that
// automatically by getCurrentUser() reading cookies(); this one needs it
// declared explicitly since staff/shop/log state must always be live.
//
// `dynamic = "force-dynamic"` alone was NOT enough in practice — verified
// directly (clock in, requery, get a stale response; clear .next/cache,
// same requery, fresh response) that a once-cached render of this route
// can keep being served afterward regardless of that setting. `fetchCache`
// is the more explicit, fetch-specific override and is what actually fixed
// it: it forces every fetch() this route makes to skip the Data Cache
// entirely, no matter what dynamic-rendering heuristics conclude.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

/**
 * Public, no auth — this is the endpoint the axla.space/c/[token] page
 * calls to greet a staff member by name before they clock in. The token
 * (not the staff row's own uuid) is the only credential; see the comment
 * on payroll_staff.clock_token in migration 020 for why they're separate.
 */
export async function GET(req: Request, { params }: { params: { token: string } }) {
  const ip = getClientIp(req);
  const { allowed, retryAfterSeconds } = checkPayrollTokenRateLimit(ip, "employee/by-token");
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const token = params.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "Invalid link." }, { status: 400 });
  }

  const { data: staff, error: staffError } = await supabaseAdmin
    .from("payroll_staff")
    .select("id, name, owner_id")
    .eq("clock_token", token)
    .maybeSingle();

  if (staffError) {
    logError("payroll/employee/by-token GET: staff lookup failed", staffError);
    return NextResponse.json({ error: "Failed to load employee." }, { status: 500 });
  }
  if (!staff) {
    return NextResponse.json({ error: "This clock-in link isn't valid. Ask your employer for a new one." }, { status: 404 });
  }

  // Absolute last log for this staff member, no date filter — clocking in
  // at 11:09 PM and reopening the link after midnight must still show
  // "Time Out", not reset to "Time In" just because the calendar day
  // rolled over. Ordering is on the timestamptz column directly, so this
  // is correct regardless of server/display timezone.
  const [{ data: shop }, { data: lastLog }] = await Promise.all([
    supabaseAdmin.from("shop_settings").select("shop_name, lat, lng").eq("owner_id", staff.owner_id).maybeSingle(),
    supabaseAdmin
      .from("timekeeping_logs")
      .select("type, created_at")
      .eq("staff_id", staff.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const lastLogType: "in" | "out" | null = lastLog?.type ?? null;

  const res = NextResponse.json({
    name: staff.name,
    shop_name: shop?.shop_name ?? "the shop",
    last_log_type: lastLogType,
    last_log: lastLog ? { type: lastLogType, timestamp: lastLog.created_at } : null,
    // Kept for backwards compat with the previous response shape — null
    // whenever the last event was an "out" (or there's no history yet).
    working_since: lastLogType === "in" ? lastLog!.created_at : null,
    // Only used client-side for the Safari/iOS "Demo Mode" fallback when
    // getCurrentPosition fails or times out — lets that clock-in still
    // submit (correctly landing "inside" the shop) instead of leaving the
    // staff member stuck with no way to clock in at all.
    shop_lat: shop?.lat ?? null,
    shop_lng: shop?.lng ?? null,
  });
  // Defense in depth alongside `dynamic = "force-dynamic"` above — that
  // stops Next's own server-side caching, this stops Safari (or any
  // intermediary) from caching the HTTP response itself and replaying a
  // stale Time In/Out state on a later visit to the same URL.
  res.headers.set("Cache-Control", "no-store, must-revalidate");
  return res;
}
