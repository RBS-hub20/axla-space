import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { hasPayrollAccess } from "@/lib/payroll/plan";
import { computePayrollRow, getCutOffRange, DEFAULT_DAYS_BY_CUTOFF, type PayrollComputeInput, type CutOff } from "@/lib/payroll/sahod";
import { computeDayCell, datesInRange, DEFAULT_SHIFT, type ShiftConfig } from "@/lib/payroll/shift";
import { logError } from "@/lib/log-error";

const MONTH_RE = /^\d{4}-\d{2}$/;
const VALID_CUTOFFS: CutOff[] = ["1-15", "16-31", "full"];

interface ComputeBody {
  month?: unknown;
  cutOff?: unknown;
  /** True only after the client's "No attendance found — use default days?" modal was explicitly confirmed by the user. Missing/false means a zero-attendance staff computes to 0 days, same as before this feature existed — the server never applies a default on its own initiative. */
  useDefaultForMissing?: unknown;
}

interface StaffRow {
  id: string;
  name: string;
  daily_rate: number;
  rate_type: "daily" | "hourly" | "monthly";
  rate_amount: number | null;
  work_days: string | null;
  shift_start: string | null;
  shift_end: string | null;
  grace_period_minutes: number | null;
}

function shiftConfigFor(s: StaffRow): ShiftConfig {
  return {
    shiftStart: s.shift_start ?? DEFAULT_SHIFT.shiftStart,
    shiftEnd: s.shift_end ?? DEFAULT_SHIFT.shiftEnd,
    gracePeriodMinutes: s.grace_period_minutes ?? DEFAULT_SHIFT.gracePeriodMinutes,
    workDays: s.work_days ?? DEFAULT_SHIFT.workDays,
  };
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canRunPayroll) {
    return NextResponse.json({ error: "You don't have permission to run payroll." }, { status: 403 });
  }
  if (!(await hasPayrollAccess(owner.ownerEmail))) {
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
  const todayIso = new Date().toISOString().slice(0, 10);

  const [{ data: staff, error: staffError }, { data: attendance, error: attError }, { data: advances, error: advError }] = await Promise.all([
    supabaseAdmin
      .from("payroll_staff")
      .select("id, name, daily_rate, rate_type, rate_amount, work_days, shift_start, shift_end, grace_period_minutes")
      .eq("owner_id", owner.ownerId),
    supabaseAdmin
      .from("payroll_attendance")
      .select("staff_id, date, time_in, time_out, status, payroll_staff!inner(owner_id)")
      .eq("payroll_staff.owner_id", owner.ownerId)
      .gte("date", range.from)
      .lt("date", range.to),
    supabaseAdmin
      .from("payroll_cash_advances")
      .select("id, staff_id, amount")
      .eq("owner_id", owner.ownerId)
      .eq("status", "pending")
      .gte("created_at", `${range.from}T00:00:00Z`)
      .lt("created_at", `${range.to}T00:00:00Z`),
  ]);

  if (staffError || attError || advError) {
    logError("payroll/runs/compute: query failed", staffError ?? attError ?? advError);
    return NextResponse.json({ error: "Failed to load payroll data." }, { status: 500 });
  }
  if (!staff || staff.length === 0) {
    return NextResponse.json({ error: "Add at least one staff member first." }, { status: 400 });
  }

  const attendanceByStaff = new Map<string, Map<string, { time_in: string | null; time_out: string | null; status?: string }>>();
  for (const row of attendance ?? []) {
    if (!attendanceByStaff.has(row.staff_id)) attendanceByStaff.set(row.staff_id, new Map());
    attendanceByStaff.get(row.staff_id)!.set(row.date, row);
  }

  const advancesByStaff = new Map<string, { total: number; ids: string[] }>();
  for (const a of advances ?? []) {
    const entry = advancesByStaff.get(a.staff_id) ?? { total: 0, ids: [] };
    entry.total += Number(a.amount);
    entry.ids.push(a.id);
    advancesByStaff.set(a.staff_id, entry);
  }

  const periodDates = datesInRange(range.from, range.to);
  const defaultDays = DEFAULT_DAYS_BY_CUTOFF[cutOff];
  const deductedAdvanceIds: string[] = [];

  const breakdown = (staff as StaffRow[]).map((s) => {
    const config = shiftConfigFor(s);
    const recordsByDate = attendanceByStaff.get(s.id) ?? new Map();

    let daysPresent = 0;
    let lateMinutes = 0;
    let undertimeMinutes = 0;
    let overtimeMinutes = 0;
    let workedMinutes = 0;
    let scheduledDaysInPeriod = 0;

    for (const date of periodDates) {
      const cell = computeDayCell(date, recordsByDate.get(date), config, todayIso);
      if (cell.kind !== "off" && cell.kind !== "future") scheduledDaysInPeriod += 1;
      if (cell.kind === "present") {
        daysPresent += 1;
        lateMinutes += cell.lateMinutes;
        undertimeMinutes += cell.undertimeMinutes;
        overtimeMinutes += cell.overtimeMinutes;
        workedMinutes += cell.workedMinutes ?? 0;
      }
    }

    // Same "only when the user explicitly confirmed, only for whoever has
    // genuinely zero real attendance" rule as before this engine existed —
    // late/undertime/overtime/workedMinutes stay 0 for an estimated day
    // count, since there's nothing real to derive them from.
    let estimated: boolean | undefined;
    if (daysPresent === 0 && useDefaultForMissing) {
      daysPresent = defaultDays;
      estimated = true;
    }

    const advance = advancesByStaff.get(s.id);
    if (advance) deductedAdvanceIds.push(...advance.ids);

    const input: PayrollComputeInput = {
      staffId: s.id,
      name: s.name,
      dailyRate: Number(s.daily_rate),
      rateType: s.rate_type ?? "daily",
      rateAmount: Number(s.rate_amount ?? s.daily_rate),
      daysPresent,
      workedMinutes,
      scheduledDaysInPeriod,
      estimated,
      lateMinutes,
      undertimeMinutes,
      overtimeMinutes,
      advancesDeduction: advance?.total ?? 0,
    };
    return computePayrollRow(input);
  });

  // total_sahod is the run's headline "This Month Payroll" figure — net
  // pay (what actually goes out the door), not gross, matching how the
  // View Details modal's Net total is meant to reconcile with it.
  const totalSahod = breakdown.reduce((sum, r) => sum + (r.netPay ?? r.basicPay), 0);

  const { data: run, error: insertError } = await supabaseAdmin
    .from("payroll_runs")
    .insert({
      owner_id: owner.ownerId,
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

  // Best-effort — the run itself already saved successfully above, so a
  // failure here shouldn't fail the whole compute (it would just leave
  // those advances "pending" instead of "deducted", still correct data,
  // just not yet marked as applied).
  if (deductedAdvanceIds.length > 0) {
    const { error: advanceUpdateError } = await supabaseAdmin.from("payroll_cash_advances").update({ status: "deducted" }).in("id", deductedAdvanceIds);
    if (advanceUpdateError) logError("payroll/runs/compute: advance status update failed", advanceUpdateError);
  }

  return NextResponse.json({ run });
}
