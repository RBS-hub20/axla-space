import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logBuddyPunchFlag } from "@/lib/payroll/audit-log";
import { getClientIp } from "@/lib/payroll/rate-limit";
import { logError } from "@/lib/log-error";

/**
 * Owner-authenticated. Part of finding #5's manual-review mitigation — the
 * admin Timekeeping tab's "Flag as buddy punching" button. Doesn't change
 * approval status (that's still the existing Approve/Reject flow); this
 * just records a permanent, audit-logged marker for a log the owner
 * suspects was punched by someone other than the actual staff member, so
 * it's visible on the log itself and in the payroll_audit_logs trail.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canApproveTimekeeping) {
    return NextResponse.json({ error: "You don't have permission to approve timekeeping." }, { status: 403 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin
    .from("timekeeping_logs")
    .update({
      buddy_punch_flagged: true,
      buddy_punch_flagged_by: user.id,
      buddy_punch_flagged_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .eq("owner_id", owner.ownerId)
    .select("id, staff_id")
    .single();

  if (error || !data) {
    logError("payroll/timekeeping/logs/[id]/flag-buddy-punch POST: update failed", error);
    return NextResponse.json({ error: "Failed to flag this entry." }, { status: 500 });
  }

  await logBuddyPunchFlag({
    ownerId: owner.ownerId,
    employeeId: data.staff_id,
    timekeepingLogId: data.id,
    flaggedBy: user.id,
    ip: getClientIp(_req),
  });

  return NextResponse.json({ success: true });
}
