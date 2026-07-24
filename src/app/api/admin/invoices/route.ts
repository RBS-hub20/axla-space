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

  const { data: invoices, error } = await supabaseAdmin
    .from("invoices")
    .select("id, user_id, invoice_number, client_name, total, currency, status, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    logError("admin/invoices GET: query failed", error);
    return NextResponse.json({ error: "Failed to load invoices." }, { status: 500 });
  }

  const rows = invoices ?? [];
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: profiles } = userIds.length
    ? await supabaseAdmin.from("profiles").select("id, email").in("id", userIds)
    : { data: [] };
  const emailById = new Map((profiles ?? []).map((p) => [p.id, p.email]));

  const withOwner = rows.map((r) => ({ ...r, owner_email: emailById.get(r.user_id) ?? null }));

  const totalInvoiced = rows.reduce((sum, r) => sum + Number(r.total), 0);
  const outstanding = rows.filter((r) => r.status === "sent").reduce((sum, r) => sum + Number(r.total), 0);
  const paid = rows.filter((r) => r.status === "paid").reduce((sum, r) => sum + Number(r.total), 0);

  return NextResponse.json({
    invoices: withOwner,
    stats: { totalInvoiced, outstanding, paid, count: rows.length },
  });
}
