import { NextResponse } from "next/server";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

// This route has no auth check (public, token-only) — nothing here calls a
// dynamic API like cookies(), so without this Next.js treats it as a
// static-rendering candidate and caches the underlying Supabase fetch()
// calls indefinitely. Every other payroll route is exempted from that
// automatically by getCurrentUser() reading cookies(); this one needs it
// declared explicitly since staff/shop/log state must always be live.
export const dynamic = "force-dynamic";

/**
 * Public, no auth — this is the endpoint the axla.space/c/[token] page
 * calls to greet a staff member by name before they clock in. The token
 * (not the staff row's own uuid) is the only credential; see the comment
 * on payroll_staff.clock_token in migration 020 for why they're separate.
 */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
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
  const workingSince = lastLogType === "in" ? lastLog!.created_at : null;

  return NextResponse.json({
    name: staff.name,
    shop_name: shop?.shop_name ?? "the shop",
    last_log_type: lastLogType,
    working_since: workingSince,
    // Only used client-side for the Safari/iOS "Demo Mode" fallback when
    // getCurrentPosition fails or times out — lets that clock-in still
    // submit (correctly landing "inside" the shop) instead of leaving the
    // staff member stuck with no way to clock in at all.
    shop_lat: shop?.lat ?? null,
    shop_lng: shop?.lng ?? null,
  });
}
