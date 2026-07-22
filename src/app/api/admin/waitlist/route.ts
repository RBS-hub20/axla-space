import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/admin-session";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";
import type { WaitlistRow } from "@/lib/supabase/admin";

export async function GET() {
  const session = cookies().get(ADMIN_SESSION_COOKIE)?.value;
  if (!verifySessionToken(session)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  // name/business_name/status come from migrations/004_waitlist_gate_and_admin_role.sql.
  // If that hasn't been run yet, Postgres errors on the unknown columns (42703) — fall
  // back to the original column set so this dashboard keeps working either way, just
  // without the plan/status columns until the migration is applied.
  let data: WaitlistRow[] | null;
  let error: { code?: string; message?: string } | null;

  const primary = await supabaseAdmin
    .from("waitlist")
    .select("id, email, name, business_name, status, bir_hate_level, created_at")
    .order("created_at", { ascending: false });
  data = primary.data;
  error = primary.error;

  if (error?.code === "42703") {
    const fallback = await supabaseAdmin
      .from("waitlist")
      .select("id, email, bir_hate_level, created_at")
      .order("created_at", { ascending: false });
    data = fallback.data;
    error = fallback.error;
  }

  if (error) {
    logError("admin/waitlist: Supabase query failed", error);
    return NextResponse.json({ error: "Failed to load waitlist." }, { status: 500 });
  }

  return NextResponse.json({ signups: data });
}
