import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

/** Freemium — viewing history is always allowed; free tier naturally has none since compute is blocked (see runs/compute/route.ts), rendered as an empty state client-side. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin
    .from("payroll_runs")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(24);

  if (error) {
    logError("payroll/runs GET: query failed", error);
    return NextResponse.json({ error: "Failed to load payroll runs." }, { status: 500 });
  }

  return NextResponse.json({ runs: data ?? [] });
}
