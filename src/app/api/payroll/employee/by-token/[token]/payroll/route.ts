import { NextResponse } from "next/server";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getPaymentProof } from "@/lib/payroll/payment-proof";
import { logError } from "@/lib/log-error";

// Public, no auth (token-only) — same reasoning as employee/by-token/route.ts
// for why both directives are needed, not just one.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

/**
 * This staff member's own payroll history — used by the "My Payroll" card
 * on axla.space/c/[token]. Scoped strictly to their own staffId: every run
 * is the owner's whole payroll (all staff), so this only ever returns the
 * single breakdown entry (and payment proof) that matches this token's
 * staff row, never anyone else's numbers.
 */
export async function GET(_req: Request, { params }: { params: { token: string } }) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const token = params.token?.trim();
  if (!token) return NextResponse.json({ error: "Invalid link." }, { status: 400 });

  const { data: staff, error: staffError } = await supabaseAdmin
    .from("payroll_staff")
    .select("id, owner_id")
    .eq("clock_token", token)
    .maybeSingle();
  if (staffError) {
    logError("payroll/employee/by-token/payroll GET: staff lookup failed", staffError);
    return NextResponse.json({ error: "Failed to load payroll history." }, { status: 500 });
  }
  if (!staff) {
    return NextResponse.json({ error: "This clock-in link isn't valid." }, { status: 404 });
  }

  const { data: runs, error: runsError } = await supabaseAdmin
    .from("payroll_runs")
    .select("id, month, cut_off, breakdown, payment_proofs, created_at")
    .eq("owner_id", staff.owner_id)
    .order("created_at", { ascending: false })
    .limit(24);
  if (runsError) {
    logError("payroll/employee/by-token/payroll GET: runs query failed", runsError);
    return NextResponse.json({ error: "Failed to load payroll history." }, { status: 500 });
  }

  const history = (runs ?? [])
    .map((run) => {
      const entry = (run.breakdown ?? []).find((b: { staffId: string }) => b.staffId === staff.id);
      if (!entry) return null;
      return {
        runId: run.id,
        month: run.month,
        cutOff: run.cut_off,
        netPay: entry.basicPay,
        proof: getPaymentProof(run.payment_proofs, staff.id),
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const res = NextResponse.json({ history });
  res.headers.set("Cache-Control", "no-store, must-revalidate");
  return res;
}
