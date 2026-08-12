import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { DEFAULT_DAILY_RATE } from "@/lib/payroll/pricing";
import { EMPLOYMENT_TYPES, RATE_TYPES, STAFF_STATUSES, type RateType } from "@/lib/payroll/staff-fields";
import { logError } from "@/lib/log-error";

interface PatchBody {
  name?: unknown;
  gcash?: unknown;
  phone?: unknown;
  dailyRate?: unknown;
  position?: unknown;
  employmentType?: unknown;
  rateType?: unknown;
  rateAmount?: unknown;
  schedule?: unknown;
  status?: unknown;
  hiredAt?: unknown;
  address?: unknown;
  sssNo?: unknown;
  philhealthNo?: unknown;
  pagibigNo?: unknown;
  tinNo?: unknown;
  bankName?: unknown;
  bankAccountNo?: unknown;
  commissionPct?: unknown;
}

const optionalText = (v: unknown, max: number): string | null | undefined => (typeof v === "string" ? v.trim().slice(0, max) || null : undefined);

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
  if (body.phone !== undefined) updates.phone = optionalText(body.phone, 20);
  if (body.position !== undefined) updates.position = optionalText(body.position, 60);
  if (typeof body.employmentType === "string" && (EMPLOYMENT_TYPES as readonly string[]).includes(body.employmentType)) {
    updates.employment_type = body.employmentType;
  }
  if (typeof body.status === "string" && (STAFF_STATUSES as readonly string[]).includes(body.status)) {
    updates.status = body.status;
  }
  if (body.schedule !== undefined) updates.schedule = optionalText(body.schedule, 120);
  if (body.hiredAt !== undefined) updates.hired_at = typeof body.hiredAt === "string" && body.hiredAt.trim() ? body.hiredAt.trim() : null;
  if (body.address !== undefined) updates.address = optionalText(body.address, 240);
  if (body.sssNo !== undefined) updates.sss_no = optionalText(body.sssNo, 40);
  if (body.philhealthNo !== undefined) updates.philhealth_no = optionalText(body.philhealthNo, 40);
  if (body.pagibigNo !== undefined) updates.pagibig_no = optionalText(body.pagibigNo, 40);
  if (body.tinNo !== undefined) updates.tin_no = optionalText(body.tinNo, 40);
  if (body.bankName !== undefined) updates.bank_name = optionalText(body.bankName, 60);
  if (body.bankAccountNo !== undefined) updates.bank_account_no = optionalText(body.bankAccountNo, 40);
  if (body.commissionPct !== undefined) {
    const pct = body.commissionPct === null || body.commissionPct === "" ? null : Number(body.commissionPct);
    if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) {
      return NextResponse.json({ error: "Commission % must be between 0 and 100." }, { status: 400 });
    }
    updates.commission_pct = pct;
  }

  // The Payroll tab form always sends rateType + rateAmount together (see
  // StaffDetailModal), so that's the only combination that needs to
  // re-sync daily_rate — the field the Run engine actually reads.
  // Amount-only or type-only edits are rejected below with a clear error
  // rather than guessing, since silently updating just one half would
  // leave rate_type/rate_amount/daily_rate inconsistent.
  const rateTypeSent = body.rateType !== undefined;
  const rateAmountSent = body.rateAmount !== undefined || body.dailyRate !== undefined;
  if (rateTypeSent || rateAmountSent) {
    if (!rateTypeSent || !rateAmountSent) {
      return NextResponse.json({ error: "Rate type and rate amount must be updated together." }, { status: 400 });
    }
    const rateType = body.rateType as RateType;
    if (!RATE_TYPES.includes(rateType)) {
      return NextResponse.json({ error: "Invalid rate type." }, { status: 400 });
    }
    const rateAmountInput = body.rateAmount !== undefined ? body.rateAmount : body.dailyRate;
    const rate = Number(rateAmountInput);
    if (!Number.isFinite(rate) || rate <= 0) {
      return NextResponse.json({ error: "Rate must be a positive number." }, { status: 400 });
    }
    updates.rate_type = rateType;
    updates.rate_amount = rate;
    updates.daily_rate = rateType === "daily" ? rate : DEFAULT_DAILY_RATE;
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
