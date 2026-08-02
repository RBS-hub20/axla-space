import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { hasPayrollAccess } from "@/lib/payroll/plan";
import {
  computeBasicPay,
  getCutOffRange,
  DEFAULT_DAYS_BY_CUTOFF,
  type StaffAttendanceSummary,
  type CutOff,
} from "@/lib/payroll/sahod";
import { logError } from "@/lib/log-error";

const MONTH_RE = /^\d{4}-\d{2}$/;
const VALID_CUTOFFS: CutOff[] = ["1-15", "16-31", "full"];

interface ComputeBody {
  month?: unknown;
  cutOff?: unknown;
  /** True only after the client's "No attendance found — use default days?" modal was explicitly confirmed by the user. Missing/false means a zero-attendance staff computes to 0 days, same as before this feature existed — the server never applies a default on its own initiative. */
  useDefaultForMissing?: unknown;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!(await hasPayrollAccess(user.email))) {
    return NextResponse.json({ error: "No active Payroll subscription.", code: "NO_SUBSCRIPTION" }, { status: 403 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  let body: ComputeBody = {};
  try {
    body = await req.json();
  } catch {
    // fall through — defaults below
  }
  const month = typeof body.month === "string" && MONTH_RE.test(body.month) ? body.month : new Date().toISOString().slice(0, 7);
  const cutOff: CutOff = typeof body.cutOff === "string" && VALID_CUTOFFS.includes(body.cutOff as CutOff) ? (body.cutOff as CutOff) : "full";
  const useDefaultForMissing = body.useDefaultForMissing === true;

  const range = getCutOffRange(month, cutOff);

  const [{ data: staff, error: staffError }, { data: attendance, error: attError }] = await Promise.all([
    supabaseAdmin.from("payroll_staff").select("id, name, daily_rate").eq("owner_id", user.id),
    supabaseAdmin
      .from("payroll_attendance")
      .select("staff_id, date, time_in, time_out, payroll_staff!inner(owner_id)")
      .eq("payroll_staff.owner_id", user.id)
      .gte("date", range.from)
      .lt("date", range.to),
  ]);

  if (staffError || attError) {
    logError("payroll/runs/compute: query failed", staffError ?? attError);
    return NextResponse.json({ error: "Failed to load payroll data." }, { status: 500 });
  }
  if (!staff || staff.length === 0) {
    return NextResponse.json({ error: "Add at least one staff member first." }, { status: 400 });
  }

  const daysPresentByStaff = new Map<string, number>();
  for (const row of attendance ?? []) {
    if (row.time_in && row.time_out) {
      daysPresentByStaff.set(row.staff_id, (daysPresentByStaff.get(row.staff_id) ?? 0) + 1);
    }
  }

  // The default is applied per-staff, only to whoever genuinely has zero
  // real attendance rows in this exact cut-off — a staff member with even
  // one real clocked day keeps their real count, never overridden.
  const defaultDays = DEFAULT_DAYS_BY_CUTOFF[cutOff];
  const summaries: StaffAttendanceSummary[] = staff.map((s) => {
    const realDays = daysPresentByStaff.get(s.id) ?? 0;
    if (realDays === 0 && useDefaultForMissing) {
      return { staffId: s.id, name: s.name, dailyRate: Number(s.daily_rate), daysPresent: defaultDays, estimated: true };
    }
    return { staffId: s.id, name: s.name, dailyRate: Number(s.daily_rate), daysPresent: realDays };
  });
  const breakdown = computeBasicPay(summaries);
  const totalSahod = breakdown.reduce((sum, r) => sum + r.basicPay, 0);

  const { data: run, error: insertError } = await supabaseAdmin
    .from("payroll_runs")
    .insert({
      owner_id: user.id,
      month,
      cut_off: cutOff,
      total_sahod: totalSahod,
      staff_count: staff.length,
      status: "finalized",
      breakdown,
    })
    .select()
    .single();

  if (insertError || !run) {
    logError("payroll/runs/compute: insert failed", insertError);
    return NextResponse.json({ error: "Failed to save payroll run." }, { status: 500 });
  }

  return NextResponse.json({ run });
}
