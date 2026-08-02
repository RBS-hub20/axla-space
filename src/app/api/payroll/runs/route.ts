import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

const RECEIPTS_BUCKET = "payroll-receipts";
const SIGNED_URL_TTL_SECONDS = 3600;

/** Freemium — viewing history is always allowed; free tier naturally has none since compute is blocked (see runs/compute/route.ts), rendered as an empty state client-side. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin
    .from("payroll_runs")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(24);

  if (error) {
    logError("payroll/runs GET: query failed", error);
    return NextResponse.json({ error: "Failed to load payroll runs." }, { status: 500 });
  }

  const runs = data ?? [];

  // Batch-sign every receipt/confirmation-selfie path across every run in
  // one call, then stitch the URLs back into each payment_proofs entry —
  // lets the Payslip tab's table and the Reports audit trail show inline
  // thumbnails without a signed-URL round trip per row.
  const paths: string[] = [];
  for (const run of runs) {
    for (const proof of Object.values(run.payment_proofs ?? {}) as { receiptPath?: string | null; confirmedSelfiePath?: string | null }[]) {
      if (proof.receiptPath) paths.push(proof.receiptPath);
      if (proof.confirmedSelfiePath) paths.push(proof.confirmedSelfiePath);
    }
  }
  const signedByPath = new Map<string, string>();
  if (paths.length > 0) {
    const { data: signed } = await supabaseAdmin.storage.from(RECEIPTS_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
    for (const s of signed ?? []) if (s.path && s.signedUrl) signedByPath.set(s.path, s.signedUrl);
  }

  const runsWithUrls = runs.map((run) => {
    const proofs = run.payment_proofs ?? {};
    const withUrls = Object.fromEntries(
      Object.entries(proofs).map(([staffId, proof]) => {
        const p = proof as { receiptPath?: string | null; confirmedSelfiePath?: string | null };
        return [
          staffId,
          {
            ...p,
            receiptUrl: p.receiptPath ? signedByPath.get(p.receiptPath) ?? null : null,
            confirmedSelfieUrl: p.confirmedSelfiePath ? signedByPath.get(p.confirmedSelfiePath) ?? null : null,
          },
        ];
      }),
    );
    return { ...run, payment_proofs: withUrls };
  });

  return NextResponse.json({ runs: runsWithUrls });
}
