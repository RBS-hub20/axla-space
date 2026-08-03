import { NextResponse } from "next/server";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getPaymentProof, type PaymentProof } from "@/lib/payroll/payment-proof";
import { checkSelfieLiveness } from "@/lib/payroll/selfie-liveness";
import { logPaymentProofChange } from "@/lib/payroll/audit-log";
import { getClientIp } from "@/lib/payroll/rate-limit";
import { logError } from "@/lib/log-error";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

const BUCKET = "payroll-receipts";

/**
 * Public, token-authenticated — the staff member's own "I actually
 * received this" confirmation, with a selfie + timestamp as their side of
 * the paper trail (mirrors the owner's receipt upload). Only allowed when
 * the owner has already marked it paid — this is confirmation, not a way
 * to self-report an unpaid run as paid.
 */
export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const token = String(formData.get("token") ?? "").trim();
  const runId = String(formData.get("runId") ?? "").trim();
  const selfie = formData.get("selfie");

  if (!token || !runId) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  if (!(selfie instanceof File)) {
    return NextResponse.json({ error: "A selfie is required to confirm.", code: "SELFIE_REQUIRED" }, { status: 400 });
  }
  const livenessCheck = await checkSelfieLiveness(selfie);
  if (!livenessCheck.ok) {
    return NextResponse.json({ error: livenessCheck.error }, { status: 400 });
  }

  const { data: staff, error: staffError } = await supabaseAdmin
    .from("payroll_staff")
    .select("id, owner_id")
    .eq("clock_token", token)
    .maybeSingle();
  if (staffError) {
    logError("confirm-payment: staff lookup failed", staffError);
    return NextResponse.json({ error: "Failed to confirm payment." }, { status: 500 });
  }
  if (!staff) {
    return NextResponse.json({ error: "This clock-in link isn't valid." }, { status: 404 });
  }

  const { data: run, error: runError } = await supabaseAdmin
    .from("payroll_runs")
    .select("id, owner_id, payment_proofs")
    .eq("id", runId)
    .maybeSingle();
  if (runError) {
    logError("confirm-payment: run lookup failed", runError);
    return NextResponse.json({ error: "Failed to confirm payment." }, { status: 500 });
  }
  if (!run || run.owner_id !== staff.owner_id) {
    return NextResponse.json({ error: "Payroll run not found." }, { status: 404 });
  }

  const currentProof = getPaymentProof(run.payment_proofs, staff.id);
  if (currentProof.status === "unpaid") {
    return NextResponse.json({ error: "This hasn't been marked as paid yet." }, { status: 400 });
  }
  if (currentProof.status === "confirmed") {
    return NextResponse.json({ proof: currentProof });
  }

  // Timestamped, not a fixed owner/run/staff path (security audit finding
  // #7) — consistent with the owner's receipt path, so a re-confirm never
  // overwrites the previous confirmation selfie.
  const selfiePath = `${staff.owner_id}/${runId}/${staff.id}-confirm-${Date.now()}.jpg`;
  const selfieBytes = new Uint8Array(await selfie.arrayBuffer());
  const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(selfiePath, selfieBytes, {
    contentType: selfie.type,
    upsert: false,
  });
  if (uploadError) {
    logError("confirm-payment: selfie upload failed", uploadError);
    return NextResponse.json({ error: "Failed to upload selfie." }, { status: 500 });
  }

  const updatedProof: PaymentProof = {
    ...currentProof,
    status: "confirmed",
    confirmedAt: new Date().toISOString(),
    confirmedSelfiePath: selfiePath,
  };
  const nextProofs = { ...(run.payment_proofs ?? {}), [staff.id]: updatedProof };
  const { error: updateError } = await supabaseAdmin.from("payroll_runs").update({ payment_proofs: nextProofs }).eq("id", runId);
  if (updateError) {
    logError("confirm-payment: update failed", updateError);
    return NextResponse.json({ error: "Failed to confirm payment." }, { status: 500 });
  }

  await logPaymentProofChange({
    ownerId: staff.owner_id,
    employeeId: staff.id,
    payrollRunId: runId,
    action: "confirm",
    oldValue: currentProof,
    newValue: updatedProof,
    ip: getClientIp(req),
  });

  return NextResponse.json({ proof: updatedProof });
}
