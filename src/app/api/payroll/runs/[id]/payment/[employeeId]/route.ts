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
const SIGNED_URL_TTL_SECONDS = 3600;

// Cents-level tolerance for float rounding — not a loophole, just avoids
// rejecting e.g. 6227 vs 6227.0000000001 from JS number math.
const AMOUNT_TOLERANCE = 0.01;

interface RunBreakdownEntry {
  staffId: string;
  basicPay: number;
}

async function loadRun(runId: string, ownerId: string) {
  const { data, error } = await supabaseAdmin
    .from("payroll_runs")
    .select("id, owner_id, breakdown, payment_proofs")
    .eq("id", runId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Owner-authenticated — view a single employee's payment proof for a run, with a fresh signed URL for the receipt/confirmation selfie if either was uploaded. */
export async function GET(_req: Request, { params }: { params: { id: string; employeeId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canViewPayroll) {
    return NextResponse.json({ error: "You don't have permission to view payroll." }, { status: 403 });
  }
  if (!isSupabaseAdminConfigured) return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });

  let run;
  try {
    run = await loadRun(params.id, owner.ownerId);
  } catch (err) {
    logError("payroll/runs/[id]/payment/[employeeId] GET: run lookup failed", err);
    return NextResponse.json({ error: "Failed to load payment proof." }, { status: 500 });
  }
  if (!run) return NextResponse.json({ error: "Payroll run not found." }, { status: 404 });

  const proof = getPaymentProof(run.payment_proofs, params.employeeId);
  const paths = [proof.receiptPath, proof.confirmedSelfiePath].filter((p): p is string => Boolean(p));
  const signedByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabaseAdmin.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    for (const s of signed ?? []) if (s.path && s.signedUrl) signedByPath.set(s.path, s.signedUrl);
  }

  return NextResponse.json({
    proof,
    receiptUrl: proof.receiptPath ? signedByPath.get(proof.receiptPath) ?? null : null,
    confirmedSelfieUrl: proof.confirmedSelfiePath ? signedByPath.get(proof.confirmedSelfiePath) ?? null : null,
  });
}

/**
 * Owner-authenticated. Two actions in one endpoint since they're the same
 * resource (a staff member's payment proof for this run):
 *  - a "receipt" file present -> full GCash flow, uploads the screenshot
 *  - no file -> quick cash mark, `note` defaults to "Cash"
 * Either way this only ever *records* that a payment happened — no money
 * actually moves through this app, per the Phase 1 scope.
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
    logError("payroll/runs/[id]/payment/[employeeId] POST: run lookup failed", err);
    return NextResponse.json({ error: "Failed to record payment." }, { status: 500 });
  }
  if (!run) return NextResponse.json({ error: "Payroll run not found." }, { status: 404 });

  // Security audit finding #2: never let an already-employee-confirmed
  // proof be silently rewritten by a plain "mark as paid" call — that path
  // would erase the confirmation (and the confirmation selfie reference)
  // with no trace. An owner who genuinely needs to correct a confirmed
  // record must go through /override, which requires a reason and is
  // audit-logged as a distinct action.
  const currentProof = getPaymentProof(run.payment_proofs, params.employeeId);
  if (currentProof.status === "confirmed") {
    return NextResponse.json(
      { error: "Already confirmed by the employee — use override to change it.", code: "ALREADY_CONFIRMED" },
      { status: 400 },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const amount = Number(formData.get("amount"));
  if (!Number.isFinite(amount) || amount <= 0) {
    return NextResponse.json({ error: "Enter a valid amount." }, { status: 400 });
  }

  // Security audit finding #2: cross-validate against the run's own
  // computed breakdown — that snapshot (taken when the run was computed
  // from real attendance/rate data) is the actual source of truth for what
  // this employee is owed, not whatever the owner's client happens to send.
  const breakdown = (run.breakdown ?? []) as RunBreakdownEntry[];
  const entry = breakdown.find((b) => b.staffId === params.employeeId);
  if (entry && Math.abs(amount - entry.basicPay) > AMOUNT_TOLERANCE) {
    return NextResponse.json(
      {
        error: `Amount mismatch — expected ₱${entry.basicPay.toLocaleString()}, got ₱${amount.toLocaleString()}.`,
        code: "AMOUNT_MISMATCH",
        expected: entry.basicPay,
        received: amount,
      },
      { status: 400 },
    );
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
    // Timestamped, not a fixed owner/run/employee path (security audit
    // finding #7) — a re-upload no longer destroys the previous receipt;
    // both stay in storage and the proof record + audit log always know
    // which path was current at the time.
    receiptPath = `${owner.ownerId}/${params.id}/${params.employeeId}-${Date.now()}.jpg`;
    const bytes = new Uint8Array(await receipt.arrayBuffer());
    const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(receiptPath, bytes, {
      contentType: receipt.type,
      upsert: false,
    });
    if (uploadError) {
      logError("payroll/runs/[id]/payment/[employeeId] POST: receipt upload failed", uploadError);
      return NextResponse.json({ error: "Failed to upload receipt." }, { status: 500 });
    }
  }

  const nowIso = new Date().toISOString();
  const updatedProof: PaymentProof = {
    status: "paid",
    amount,
    gcashRef: receiptPath ? gcashRef : null,
    receiptPath,
    note: receiptPath ? null : noteRaw || "Cash",
    paidAt: nowIso,
    paidByOwner: user.id,
    confirmedAt: null,
    confirmedSelfiePath: null,
  };

  const nextProofs = { ...(run.payment_proofs ?? {}), [params.employeeId]: updatedProof };
  const { error: updateError } = await supabaseAdmin.from("payroll_runs").update({ payment_proofs: nextProofs }).eq("id", params.id);
  if (updateError) {
    logError("payroll/runs/[id]/payment/[employeeId] POST: update failed", updateError);
    return NextResponse.json({ error: "Failed to record payment." }, { status: 500 });
  }

  await logPaymentProofChange({
    ownerId: owner.ownerId,
    employeeId: params.employeeId,
    payrollRunId: params.id,
    action: "mark_paid",
    oldValue: currentProof.status === "unpaid" ? null : currentProof,
    newValue: updatedProof,
    ip: getClientIp(req),
  });

  return NextResponse.json({ proof: updatedProof });
}
