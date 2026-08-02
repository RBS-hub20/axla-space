import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

interface ApproveBody {
  approved?: unknown;
}

/** Auth required. Body { approved: true|false } — Approve sets needs_approval false + approved true, Reject sets needs_approval false + approved false. Either way approved_by/approved_at record who reviewed it (this app's session user.id stands in for auth.uid(), see the note in migration 020). */
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  let body: ApproveBody = {};
  try {
    body = await req.json();
  } catch {
    // default to approve below
  }
  const approved = body.approved !== false;

  const { data, error } = await supabaseAdmin
    .from("timekeeping_logs")
    .update({
      needs_approval: false,
      approved,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .eq("owner_id", user.id)
    .select()
    .single();

  if (error || !data) {
    logError("payroll/timekeeping/logs/[id]/approve POST: update failed", error);
    return NextResponse.json({ error: "Failed to update log." }, { status: 500 });
  }

  return NextResponse.json({ log: data });
}
