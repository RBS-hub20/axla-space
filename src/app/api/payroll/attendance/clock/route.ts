import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getPayrollPlan } from "@/lib/payroll/plan";
import { FREE_ATTENDANCE_LIMIT, tierOf } from "@/lib/payroll/pricing";
import { logError } from "@/lib/log-error";

interface ClockBody {
  staffId?: unknown;
  action?: unknown;
}

/**
 * Freemium mock timekeeping — records a real time_in/time_out timestamp for
 * today, one row per staff per day (unique constraint on payroll_attendance).
 * No selfie capture/upload in this phase — selfie_url stays null, the
 * button is a placeholder per spec, not a real camera flow. Free tier is
 * capped at FREE_ATTENDANCE_LIMIT total rows (lifetime, across all staff) —
 * clocking in then out on the SAME already-created row (today's) doesn't
 * count as a second entry, only creating a brand-new date row does.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  let body: ClockBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const staffId = typeof body.staffId === "string" ? body.staffId : "";
  const action = body.action === "in" || body.action === "out" ? body.action : null;
  if (!staffId || !action) {
    return NextResponse.json({ error: "staffId and action ('in'|'out') are required." }, { status: 400 });
  }

  // Ownership check — a staff id belonging to a different owner must 404, not silently record attendance against it.
  const { data: staff, error: staffError } = await supabaseAdmin
    .from("payroll_staff")
    .select("id")
    .eq("id", staffId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (staffError) {
    logError("payroll/attendance/clock: staff lookup failed", staffError);
    return NextResponse.json({ error: "Failed to record attendance." }, { status: 500 });
  }
  if (!staff) {
    return NextResponse.json({ error: "Staff not found." }, { status: 404 });
  }

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const { data: existing } = await supabaseAdmin
    .from("payroll_attendance")
    .select("*")
    .eq("staff_id", staffId)
    .eq("date", today)
    .maybeSingle();

  if (!existing) {
    const plan = await getPayrollPlan(user.email);
    const limit = tierOf(plan) === "free" ? FREE_ATTENDANCE_LIMIT : null;
    if (limit !== null) {
      const { count, error: countError } = await supabaseAdmin
        .from("payroll_attendance")
        .select("id, payroll_staff!inner(owner_id)", { count: "exact", head: true })
        .eq("payroll_staff.owner_id", user.id);
      if (countError) {
        logError("payroll/attendance/clock: count check failed", countError);
        return NextResponse.json({ error: "Failed to record attendance." }, { status: 500 });
      }
      if ((count ?? 0) >= limit) {
        return NextResponse.json(
          { error: "Free plan allows 1 attendance entry — upgrade to Starter ₱149/mo for real timekeeping.", code: "ATTENDANCE_LIMIT_REACHED" },
          { status: 403 },
        );
      }
    }
  }

  const patch = action === "in" ? { time_in: now.toISOString() } : { time_out: now.toISOString() };

  const { data, error } = await supabaseAdmin
    .from("payroll_attendance")
    .upsert(
      { staff_id: staffId, date: today, ...(existing ?? {}), ...patch },
      { onConflict: "staff_id,date" },
    )
    .select()
    .single();

  if (error || !data) {
    logError("payroll/attendance/clock: upsert failed", error);
    return NextResponse.json({ error: "Failed to record attendance." }, { status: 500 });
  }

  return NextResponse.json({ attendance: data });
}
