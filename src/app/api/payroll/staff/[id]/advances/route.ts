import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

/** Cash advances are a lightweight ledger (Phase 1) — recorded per staff, not yet auto-netted against a finalized Payroll Run. */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canViewPayroll) {
    return NextResponse.json({ error: "You don't have permission to view payroll." }, { status: 403 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin
    .from("payroll_cash_advances")
    .select("*")
    .eq("staff_id", params.id)
    .eq("owner_id", owner.ownerId)
    .order("created_at", { ascending: false });

  if (error) {
    logError("payroll/staff/[id]/advances GET: query failed", error);
    return NextResponse.json({ error: "Failed to load cash advances." }, { status: 500 });
  }

  return NextResponse.json({ advances: data ?? [] });
}

interface AdvanceBody {
  amount?: unknown;
  reason?: unknown;
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
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

  const { data: staffRow } = await supabaseAdmin.from("payroll_staff").select("id").eq("id", params.id).eq("owner_id", owner.ownerId).maybeSingle();
  if (!staffRow) {
    return NextResponse.json({ error: "Staff not found." }, { status: 404 });
  }

  let body: AdvanceBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Amount must be a positive number." }, { status: 400 });
  }
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 200) || null : null;

  const { data, error } = await supabaseAdmin
    .from("payroll_cash_advances")
    .insert({ staff_id: params.id, owner_id: owner.ownerId, amount, reason })
    .select()
    .single();

  if (error || !data) {
    logError("payroll/staff/[id]/advances POST: insert failed", error);
    return NextResponse.json({ error: "Failed to record cash advance." }, { status: 500 });
  }

  return NextResponse.json({ advance: data });
}
