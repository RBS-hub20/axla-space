import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

const ADVANCE_STATUSES = ["pending", "paid", "deducted"] as const;

interface PatchBody {
  status?: unknown;
}

export async function PATCH(req: Request, { params }: { params: { id: string; advanceId: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canEditPayroll) {
    return NextResponse.json({ error: "You don't have permission to edit payroll." }, { status: 403 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.status !== "string" || !(ADVANCE_STATUSES as readonly string[]).includes(body.status)) {
    return NextResponse.json({ error: "Invalid status." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("payroll_cash_advances")
    .update({ status: body.status })
    .eq("id", params.advanceId)
    .eq("staff_id", params.id)
    .eq("owner_id", owner.ownerId)
    .select()
    .single();

  if (error || !data) {
    logError("payroll/staff/[id]/advances/[advanceId] PATCH: update failed", error);
    return NextResponse.json({ error: "Failed to update cash advance." }, { status: 500 });
  }

  return NextResponse.json({ advance: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string; advanceId: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canEditPayroll) {
    return NextResponse.json({ error: "You don't have permission to edit payroll." }, { status: 403 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const { error } = await supabaseAdmin
    .from("payroll_cash_advances")
    .delete()
    .eq("id", params.advanceId)
    .eq("staff_id", params.id)
    .eq("owner_id", owner.ownerId);

  if (error) {
    logError("payroll/staff/[id]/advances/[advanceId] DELETE: delete failed", error);
    return NextResponse.json({ error: "Failed to remove cash advance." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
