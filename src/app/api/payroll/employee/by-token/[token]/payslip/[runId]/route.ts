import { NextResponse } from "next/server";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { checkPayrollTokenRateLimit, getClientIp } from "@/lib/payroll/rate-limit";
import { logError } from "@/lib/log-error";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

/**
 * Public, no auth (token-only) — feeds axla.space/p/[token]/payslip/[runId],
 * which generates the payslip PDF client-side (same generatePayslipPdf lib
 * the admin dashboard uses). Only ever returns THIS token's own breakdown
 * row from the run — the run itself covers every staff member, so this is
 * the one place that access boundary actually matters.
 */
export async function GET(req: Request, { params }: { params: { token: string; runId: string } }) {
  const ip = getClientIp(req);
  const { allowed, retryAfterSeconds } = checkPayrollTokenRateLimit(ip, "employee/by-token/payslip");
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const token = params.token?.trim();
  if (!token) return NextResponse.json({ error: "Invalid link." }, { status: 400 });

  const { data: staff, error: staffError } = await supabaseAdmin
    .from("payroll_staff")
    .select("id, name, gcash, owner_id")
    .eq("clock_token", token)
    .maybeSingle();
  if (staffError) {
    logError("payroll/employee/by-token/payslip GET: staff lookup failed", staffError);
    return NextResponse.json({ error: "Failed to load payslip." }, { status: 500 });
  }
  if (!staff) return NextResponse.json({ error: "This clock-in link isn't valid." }, { status: 404 });

  const [{ data: run, error: runError }, { data: company }] = await Promise.all([
    supabaseAdmin.from("payroll_runs").select("id, owner_id, breakdown").eq("id", params.runId).maybeSingle(),
    supabaseAdmin.from("payroll_companies").select("business_name").eq("owner_id", staff.owner_id).maybeSingle(),
  ]);
  if (runError) {
    logError("payroll/employee/by-token/payslip GET: run lookup failed", runError);
    return NextResponse.json({ error: "Failed to load payslip." }, { status: 500 });
  }
  if (!run || run.owner_id !== staff.owner_id) {
    return NextResponse.json({ error: "Payslip not found." }, { status: 404 });
  }

  const entry = (run.breakdown ?? []).find((b: { staffId: string }) => b.staffId === staff.id);
  if (!entry) {
    return NextResponse.json({ error: "No payslip for this period." }, { status: 404 });
  }

  const res = NextResponse.json({
    businessName: company?.business_name ?? "Your Employer",
    staffName: staff.name,
    dailyRate: entry.dailyRate,
    daysPresent: entry.daysPresent,
    basicPay: entry.basicPay,
    gcash: staff.gcash ?? null,
  });
  res.headers.set("Cache-Control", "no-store, must-revalidate");
  return res;
}
