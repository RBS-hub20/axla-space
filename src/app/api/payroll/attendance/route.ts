import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

const MONTH_RE = /^\d{4}-\d{2}$/;

/** Freemium — attendance for the caller's own staff only, scoped via the payroll_staff join (owner_id), never the raw staff_id alone. No plan required to view; the entry cap is enforced on write, in clock/route.ts. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canViewPayroll) {
    return NextResponse.json({ error: "You don't have permission to view payroll." }, { status: 403 });
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
    .eq("payroll_staff.owner_id", owner.ownerId)
    .gte("date", from)
    .lt("date", to)
    .order("date", { ascending: false });

  if (error) {
    logError("payroll/attendance GET: query failed", error);
    return NextResponse.json({ error: "Failed to load attendance." }, { status: 500 });
  }

  return NextResponse.json({ attendance: data ?? [], month: monthKey });
}
