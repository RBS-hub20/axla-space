import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";
import type { PaymentProof } from "@/lib/payroll/payment-proof";

export type PaymentProofAction = "mark_paid" | "confirm" | "override";

interface LogPaymentProofChangeArgs {
  ownerId: string;
  employeeId: string;
  payrollRunId: string;
  action: PaymentProofAction;
  oldValue: PaymentProof | null;
  newValue: PaymentProof;
  reason?: string | null;
  ip?: string | null;
}

/**
 * Best-effort — a logging failure must never block the actual payment
 * mutation it's recording (same fail-open reasoning as every other
 * non-critical write in this codebase, e.g. logActivity). Errors are
 * surfaced via logError only.
 */
export async function logPaymentProofChange({
  ownerId,
  employeeId,
  payrollRunId,
  action,
  oldValue,
  newValue,
  reason,
  ip,
}: LogPaymentProofChangeArgs): Promise<void> {
  const { error } = await supabaseAdmin.from("payroll_audit_logs").insert({
    owner_id: ownerId,
    employee_id: employeeId,
    payroll_run_id: payrollRunId,
    action,
    old_value: oldValue,
    new_value: newValue,
    reason: reason ?? null,
    ip: ip ?? null,
  });
  if (error) {
    logError(`payroll audit log insert failed (action=${action})`, error);
  }
}

interface LogBuddyPunchFlagArgs {
  ownerId: string;
  employeeId: string;
  timekeepingLogId: string;
  flaggedBy: string;
  ip?: string | null;
}

/**
 * Separate from logPaymentProofChange since a buddy-punching flag isn't
 * scoped to a payroll run (migration 023 made payroll_run_id nullable
 * specifically for this) and has no old/new PaymentProof value — the
 * "new value" here is just a record of the flag itself.
 */
export async function logBuddyPunchFlag({ ownerId, employeeId, timekeepingLogId, flaggedBy, ip }: LogBuddyPunchFlagArgs): Promise<void> {
  const { error } = await supabaseAdmin.from("payroll_audit_logs").insert({
    owner_id: ownerId,
    employee_id: employeeId,
    payroll_run_id: null,
    action: "buddy_punch_flag",
    old_value: null,
    new_value: { timekeepingLogId, flaggedBy },
    ip: ip ?? null,
  });
  if (error) {
    logError("payroll audit log insert failed (action=buddy_punch_flag)", error);
  }
}
