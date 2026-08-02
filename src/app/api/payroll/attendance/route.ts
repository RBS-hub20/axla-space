import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { hasPayrollAccess } from "@/lib/payroll/plan";
import { logError } from "@/lib/log-error";

const MONTH_RE = /^\d{4}-\d{2}$/;

/** Attendance for the caller's own staff only, scoped via the payroll_staff join (owner_id), never the raw staff_id alone. */
export async function GET(req: Request) {
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

  const month = new URL(req.url).searchParams.get("month");
  const monthKey = month && MONTH_RE.test(month) ? month : new Date().toISOString().slice(0, 7);
  const from = `${monthKey}-01`;
  const to = new Date(new Date(`${from}T00:00:00Z`).getFullYear(), new Date(`${from}T00:00:00Z`).getMonth() + 1, 1)
    .toISOString()
    .slice(0, 10);

  const { data, error } = await supabaseAdmin
    .from("payroll_attendance")
    .select("*, payroll_staff!inner(name, owner_id)")
    .eq("payroll_staff.owner_id", user.id)
    .gte("date", from)
    .lt("date", to)
    .order("date", { ascending: false });

  if (error) {
    logError("payroll/attendance GET: query failed", error);
    return NextResponse.json({ error: "Failed to load attendance." }, { status: 500 });
  }

  return NextResponse.json({ attendance: data ?? [], month: monthKey });
}
