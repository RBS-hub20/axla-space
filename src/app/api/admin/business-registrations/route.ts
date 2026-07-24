import { NextResponse } from "next/server";
import { isAdminRequestAuthorized } from "@/lib/admin";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

/**
 * Lists Business Toolkit kit generations for the admin compliance view.
 * `status` here is this app's own record of "a kit was generated" — there
 * is no real BIR/DTI/SEC validation API this app calls, so this is not a
 * live government verification result, just what's on file.
 */
export async function GET() {
  if (!(await isAdminRequestAuthorized())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const { data: registrations, error } = await supabaseAdmin
    .from("business_registrations")
    .select("id, user_id, type, data, status, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) {
    logError("admin/business-registrations GET: query failed", error);
    return NextResponse.json({ error: "Failed to load registrations." }, { status: 500 });
  }

  const rows = registrations ?? [];
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const { data: profiles } = userIds.length
    ? await supabaseAdmin.from("profiles").select("id, email").in("id", userIds)
    : { data: [] };
  const emailById = new Map((profiles ?? []).map((p) => [p.id, p.email]));

  function businessNameOf(row: (typeof rows)[number]): string {
    const data = row.data as Record<string, unknown>;
    if (Array.isArray(data.businessNameOptions) && data.businessNameOptions[0]) return String(data.businessNameOptions[0]);
    if (Array.isArray(data.companyNameOptions) && data.companyNameOptions[0]) return String(data.companyNameOptions[0]);
    if (typeof data.businessName === "string" && data.businessName) return data.businessName;
    return "—";
  }

  const withDetails = rows
    .map((r) => ({
      id: r.id,
      type: r.type,
      status: r.status,
      created_at: r.created_at,
      owner_email: emailById.get(r.user_id) ?? null,
      business_name: businessNameOf(r),
    }))
    // Rows for Axla's own business float to the top — everything else stays newest-first.
    .sort((a, b) => {
      const aIsAxla = a.business_name.toUpperCase().includes("AXLA") ? 1 : 0;
      const bIsAxla = b.business_name.toUpperCase().includes("AXLA") ? 1 : 0;
      if (aIsAxla !== bIsAxla) return bIsAxla - aIsAxla;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  return NextResponse.json({
    registrations: withDetails,
    counts: {
      dti: rows.filter((r) => r.type === "DTI").length,
      sec: rows.filter((r) => r.type === "SEC").length,
      mayors: rows.filter((r) => r.type === "MAYORS").length,
      open: rows.filter((r) => r.type === "OPEN").length,
      close: rows.filter((r) => r.type === "CLOSE").length,
      spa: rows.filter((r) => r.type === "SPA").length,
    },
  });
}
