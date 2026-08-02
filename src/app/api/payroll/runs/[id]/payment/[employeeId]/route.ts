import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getPaymentProof, type PaymentProof } from "@/lib/payroll/payment-proof";
import { logError } from "@/lib/log-error";

const BUCKET = "payroll-receipts";
const SIGNED_URL_TTL_SECONDS = 3600;
const MAX_RECEIPT_BYTES = 5 * 1024 * 1024;
const ALLOWED_RECEIPT_TYPES = ["image/jpeg", "image/png", "image/webp"];

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

/** Owner-authenticated — view a single employee's payment proof for a run, with a fresh signed URL for the receipt/confirmation selfie if either was uploaded. */
export async function GET(_req: Request, { params }: { params: { id: string; employeeId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!isSupabaseAdminConfigured) return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });

  let run;
  try {
    run = await loadRun(params.id, user.id);
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
  if (!isSupabaseAdminConfigured) return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });

  let run;
  try {
    run = await loadRun(params.id, user.id);
  } catch (err) {
    logError("payroll/runs/[id]/payment/[employeeId] POST: run lookup failed", err);
    return NextResponse.json({ error: "Failed to record payment." }, { status: 500 });
  }
  if (!run) return NextResponse.json({ error: "Payroll run not found." }, { status: 404 });

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
  const gcashRef = String(formData.get("gcashRef") ?? "").trim().slice(0, 60) || null;
  const noteRaw = String(formData.get("note") ?? "").trim().slice(0, 120);
  const receipt = formData.get("receipt");

  let receiptPath: string | null = null;
  if (receipt instanceof File) {
    if (!ALLOWED_RECEIPT_TYPES.includes(receipt.type)) {
      return NextResponse.json({ error: "Receipt must be a JPEG, PNG, or WebP image." }, { status: 400 });
    }
    if (receipt.size > MAX_RECEIPT_BYTES) {
      return NextResponse.json({ error: "Receipt must be under 5MB." }, { status: 400 });
    }
    receiptPath = `${user.id}/${params.id}/${params.employeeId}.jpg`;
    const bytes = new Uint8Array(await receipt.arrayBuffer());
    const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(receiptPath, bytes, {
      contentType: receipt.type,
      upsert: true,
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

  return NextResponse.json({ proof: updatedProof });
}
