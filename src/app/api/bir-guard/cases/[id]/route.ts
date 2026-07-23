import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { hasBirGuardAccess } from "@/lib/dashboard/bir-guard-access";
import { logError } from "@/lib/log-error";

const VALID_STATUSES = ["open", "penalty", "filed"];

interface PatchBody {
  status?: unknown;
  penaltyAmount?: unknown;
  notes?: unknown;
  dueDate?: unknown;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  if (!(await hasBirGuardAccess(user.email))) {
    return NextResponse.json({ error: "BIR Guard is a PRO feature.", code: "UPGRADE_REQUIRED" }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (typeof body.status === "string" && VALID_STATUSES.includes(body.status)) {
    updates.status = body.status;
    updates.resolved_at = body.status === "filed" ? new Date().toISOString() : null;
  }
  if (body.penaltyAmount !== undefined) {
    const amount = Number(body.penaltyAmount);
    if (!Number.isFinite(amount) || amount < 0) {
      return NextResponse.json({ error: "Penalty amount must be a non-negative number." }, { status: 400 });
    }
    updates.penalty_amount = amount;
  }
  if (typeof body.notes === "string") updates.notes = body.notes.slice(0, 2000);
  if (typeof body.dueDate === "string") updates.due_date = body.dueDate || null;

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const startedAt = Date.now();
  const { data, error } = await supabaseAdmin
    .from("bir_open_cases")
    .update(updates)
    .eq("id", params.id)
    .eq("user_id", user.id) // scoped to the caller's own rows — never trust the id param alone
    .select()
    .single();

  await supabaseAdmin.from("bir_sync_logs").insert({
    user_id: user.id,
    status: error ? "error" : "success",
    error_message: error ? error.message : `Updated case ${params.id}`,
    duration_ms: Date.now() - startedAt,
  });

  if (error || !data) {
    logError("bir-guard/cases/[id] PATCH: update failed", error);
    return NextResponse.json({ error: "Failed to update case." }, { status: 500 });
  }

  return NextResponse.json({ case: data });
}
