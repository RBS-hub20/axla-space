import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canViewFilings) {
    return NextResponse.json({ error: "You don't have permission to view filings." }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("bir_filings")
    .select("id, quarter, year, gross, tax_due, status, finalized_at")
    .eq("user_id", owner.ownerId)
    .order("year", { ascending: false })
    .order("quarter", { ascending: false })
    .limit(10);

  if (error) {
    logError("bir/2551q/filings GET: query failed", error);
    return NextResponse.json({ error: "Failed to load filings." }, { status: 500 });
  }

  return NextResponse.json({ filings: data ?? [] });
}
