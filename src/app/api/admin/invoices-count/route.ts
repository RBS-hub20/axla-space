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

  const { count, error } = await supabaseAdmin.from("invoices").select("id", { count: "exact", head: true });
  if (error) {
    logError("admin/invoices-count: query failed", error);
    return NextResponse.json({ error: "Failed to load invoice count." }, { status: 500 });
  }

  return NextResponse.json({ totalInvoices: count ?? 0 });
}
