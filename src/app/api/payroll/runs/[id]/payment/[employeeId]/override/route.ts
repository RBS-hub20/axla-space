import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getPaymentProof, type PaymentProof } from "@/lib/payroll/payment-proof";
import { validateImageUpload } from "@/lib/payroll/file-validation";
import { logPaymentProofChange } from "@/lib/payroll/audit-log";
import { getClientIp } from "@/lib/payroll/rate-limit";
import { logError } from "@/lib/log-error";

const BUCKET = "payroll-receipts";

async function loadRun(runId: string, ownerId: string) {
  const { data, error } = await supabaseAdmin
    .from("payroll_runs")
    .select("id, owner_id, payment_proofs")
    .eq("id", runId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Owner-authenticated escape hatch for correcting a payment-proof record
 * that /payment (the normal "mark as paid" route) now refuses to touch
 * once it's `confirmed`, or where the amount wouldn't pass that route's
 * cross-check against the run's computed breakdown. Unlike /payment, this
 * intentionally skips both guards — but only after a mandatory `reason` and
 * always through an audit-logged `action: "override"` row, so a correction
 * is still fully traceable rather than an untracked silent overwrite.
 *
 * owner_id is deliberately never read from the request body — it's always
 * the authenticated session's own user.id, exactly like every other
 * owner-scoped payroll route. A client-supplied owner_id would let anyone
 * attribute an override to a different account.
 */
export async function POST(req: Request, { params }: { params: { id: string; employeeId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canRunPayroll) {
    return NextResponse.json({ error: "You don't have permission to run payroll." }, { status: 403 });
  }
  if (!isSupabaseAdminConfigured) return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });

  let run;
  try {
    run = await loadRun(params.id, owner.ownerId);
  } catch (err) {
    logError("payroll/runs/[id]/payment/[employeeId]/override POST: run lookup failed", err);
    return NextResponse.json({ error: "Failed to override payment." }, { status: 500 });
  }
  if (!run) return NextResponse.json({ error: "Payroll run not found." }, { status: 404 });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300);
  if (!reason) {
    return NextResponse.json({ error: "A reason is required to override a payment record." }, { status: 400 });
  }

  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Enter a valid amount." }, { status: 400 });
  }

  const gcashRef = String(formData.get("gcashRef") ?? "").trim().slice(0, 60) || null;
  const noteRaw = String(formData.get("note") ?? "").trim().slice(0, 120);
  const receipt = formData.get("receipt");

  let receiptPath: string | null = null;
  if (receipt instanceof File) {
    const validation = await validateImageUpload(receipt);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }
    receiptPath = `${owner.ownerId}/${params.id}/${params.employeeId}-override-${Date.now()}.jpg`;
    const bytes = new Uint8Array(await receipt.arrayBuffer());
    const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(receiptPath, bytes, {
      contentType: receipt.type,
      upsert: false,
    });
    if (uploadError) {
      logError("payroll/runs/[id]/payment/[employeeId]/override POST: receipt upload failed", uploadError);
      return NextResponse.json({ error: "Failed to upload receipt." }, { status: 500 });
    }
  }

  const currentProof = getPaymentProof(run.payment_proofs, params.employeeId);
  const nowIso = new Date().toISOString();
  const updatedProof: PaymentProof = {
    status: "paid",
    amount,
    gcashRef: receiptPath ? gcashRef : null,
    receiptPath: receiptPath ?? currentProof.receiptPath,
    note: receiptPath ? null : noteRaw || "Cash",
    paidAt: nowIso,
    paidByOwner: user.id,
    confirmedAt: null,
    confirmedSelfiePath: null,
  };

  const nextProofs = { ...(run.payment_proofs ?? {}), [params.employeeId]: updatedProof };
  const { error: updateError } = await supabaseAdmin.from("payroll_runs").update({ payment_proofs: nextProofs }).eq("id", params.id);
  if (updateError) {
    logError("payroll/runs/[id]/payment/[employeeId]/override POST: update failed", updateError);
    return NextResponse.json({ error: "Failed to override payment." }, { status: 500 });
  }

  await logPaymentProofChange({
    ownerId: owner.ownerId,
    employeeId: params.employeeId,
    payrollRunId: params.id,
    action: "override",
    oldValue: currentProof.status === "unpaid" ? null : currentProof,
    newValue: updatedProof,
    reason,
    ip: getClientIp(req),
  });

  return NextResponse.json({ proof: updatedProof });
}
