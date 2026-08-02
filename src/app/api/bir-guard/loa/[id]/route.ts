import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { hasBirGuardBusinessAccess } from "@/lib/dashboard/bir-guard-access";
import { logError } from "@/lib/log-error";

const VALID_STATUSES = ["open", "submitted", "closed"];

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }
  if (!(await hasBirGuardBusinessAccess(user.email))) {
    return NextResponse.json({ error: "LOA Tracker is a BUSINESS feature.", code: "BUSINESS_ONLY" }, { status: 403 });
  }

  let body: { status?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (typeof body.status !== "string" || !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("bir_loa_cases")
    .update({ status: body.status })
    .eq("id", params.id)
    .eq("user_id", user.id) // scoped to the caller's own rows — never trust the id param alone
    .select()
    .single();

  if (error || !data) {
    logError("bir-guard/loa/[id] PATCH: update failed", error);
    return NextResponse.json({ error: "Failed to update LOA case." }, { status: 500 });
  }

  return NextResponse.json({ loa: data });
}
