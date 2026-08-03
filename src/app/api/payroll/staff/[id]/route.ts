import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

interface PatchBody {
  name?: unknown;
  gcash?: unknown;
  dailyRate?: unknown;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
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

  const updates: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) updates.name = body.name.trim().slice(0, 120);
  if (typeof body.gcash === "string") updates.gcash = body.gcash.trim().slice(0, 20) || null;
  if (body.dailyRate !== undefined) {
    const rate = Number(body.dailyRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      return NextResponse.json({ error: "Daily rate must be a positive number." }, { status: 400 });
    }
    updates.daily_rate = rate;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No valid fields to update." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("payroll_staff")
    .update(updates)
    .eq("id", params.id)
    .eq("owner_id", owner.ownerId) // scoped to the effective owner's rows — never trust the id param alone
    .select()
    .single();

  if (error || !data) {
    logError("payroll/staff/[id] PATCH: update failed", error);
    return NextResponse.json({ error: "Failed to update staff." }, { status: 500 });
  }

  return NextResponse.json({ staff: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
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

  const { error } = await supabaseAdmin.from("payroll_staff").delete().eq("id", params.id).eq("owner_id", owner.ownerId);

  if (error) {
    logError("payroll/staff/[id] DELETE: delete failed", error);
    return NextResponse.json({ error: "Failed to remove staff." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
