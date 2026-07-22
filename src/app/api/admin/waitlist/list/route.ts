import { NextResponse } from "next/server";
import { isAdminRequestAuthorized } from "@/lib/admin";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

export async function GET() {
  if (!(await isAdminRequestAuthorized())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin
    .from("waitlist")
    .select("id, email, name, business_name, status, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    logError("admin/waitlist/list: query failed", error);
    return NextResponse.json({ error: "Failed to load waitlist." }, { status: 500 });
  }

  const rows = data ?? [];
  const counts = {
    pending: rows.filter((r) => !r.status || r.status === "pending").length,
    approved: rows.filter((r) => r.status === "approved").length,
    rejected: rows.filter((r) => r.status === "rejected").length,
    total: rows.length,
  };

  return NextResponse.json({ waitlist: rows, counts });
}
