import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { hasBirGuardAccess } from "@/lib/dashboard/bir-guard-access";
import { resend, isResendConfigured, RESEND_FROM_EMAIL } from "@/lib/resend";
import { birGuardAlertEmailTemplate } from "@/lib/email-templates";
import { logError } from "@/lib/log-error";

const VALID_STATUSES = ["open", "penalty", "filed"];
const SCREENSHOT_BUCKET = "bir-guard-screenshots";
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour — re-signed fresh on every page load, so screenshot_url only ever stores the raw storage path, never a URL that can go stale.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  if (!(await hasBirGuardAccess(user.email))) {
    return NextResponse.json({ error: "BIR Guard is a PRO feature.", code: "UPGRADE_REQUIRED" }, { status: 403 });
  }

  const [{ data, error }, { data: logData, error: logError_ }] = await Promise.all([
    supabaseAdmin.from("bir_open_cases").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
    supabaseAdmin
      .from("bir_sync_logs")
      .select("id, status, error_message, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);

  if (error) {
    logError("bir-guard/cases GET: query failed", error);
    return NextResponse.json({ error: "Failed to load cases." }, { status: 500 });
  }
  if (logError_) {
    logError("bir-guard/cases GET: activity log query failed (non-fatal)", logError_);
  }

  const cases = await Promise.all(
    (data ?? []).map(async (row) => {
      if (!row.screenshot_url) return row;
      const { data: signed } = await supabaseAdmin.storage
        .from(SCREENSHOT_BUCKET)
        .createSignedUrl(row.screenshot_url, SIGNED_URL_TTL_SECONDS);
      return { ...row, screenshot_signed_url: signed?.signedUrl ?? null };
    }),
  );

  return NextResponse.json({ cases, logs: logData ?? [] });
}

interface CaseBody {
  formType?: unknown;
  taxPeriod?: unknown;
  status?: unknown;
  penaltyAmount?: unknown;
  dueDate?: unknown;
  notes?: unknown;
}

/** Manual entry only — the user looks up mytax.bir.gov.ph themselves and records what they see. No credentials, no bot. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  if (!(await hasBirGuardAccess(user.email))) {
    return NextResponse.json({ error: "BIR Guard is a PRO feature.", code: "UPGRADE_REQUIRED" }, { status: 403 });
  }

  let body: CaseBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.formType !== "string" || !body.formType.trim()) {
    return NextResponse.json({ error: "Form type is required." }, { status: 400 });
  }
  if (typeof body.taxPeriod !== "string" || !body.taxPeriod.trim()) {
    return NextResponse.json({ error: "Tax period is required." }, { status: 400 });
  }
  const status = typeof body.status === "string" && VALID_STATUSES.includes(body.status) ? body.status : "open";
  const penaltyAmount = Number(body.penaltyAmount) || 0;
  if (!Number.isFinite(penaltyAmount) || penaltyAmount < 0) {
    return NextResponse.json({ error: "Penalty amount must be a non-negative number." }, { status: 400 });
  }
  const dueDate = typeof body.dueDate === "string" && body.dueDate ? body.dueDate : null;
  const notes = typeof body.notes === "string" ? body.notes.slice(0, 2000) : null;

  const startedAt = Date.now();
  const { data, error } = await supabaseAdmin
    .from("bir_open_cases")
    .insert({
      user_id: user.id,
      form_type: body.formType.trim(),
      tax_period: body.taxPeriod.trim(),
      status,
      penalty_amount: penaltyAmount,
      due_date: dueDate,
      notes,
      resolved_at: status === "filed" ? new Date().toISOString() : null,
    })
    .select()
    .single();

  await supabaseAdmin.from("bir_sync_logs").insert({
    user_id: user.id,
    status: error ? "error" : "success",
    error_message: error ? error.message : `Added ${body.formType.trim()} — ${body.taxPeriod.trim()}`,
    duration_ms: Date.now() - startedAt,
  });

  if (error || !data) {
    logError("bir-guard/cases POST: insert failed", error);
    return NextResponse.json({ error: "Failed to save case." }, { status: 500 });
  }

  // Best-effort alert email when the newly-logged case carries a penalty —
  // never blocks the response the UI is waiting on.
  if ((status === "penalty" || penaltyAmount > 0) && isResendConfigured) {
    (async () => {
      try {
        const [{ data: openCases }, { data: profile }] = await Promise.all([
          supabaseAdmin.from("bir_open_cases").select("penalty_amount").eq("user_id", user.id).neq("status", "filed"),
          supabaseAdmin.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
        ]);
        const totalPenalty = (openCases ?? []).reduce((sum, c) => sum + Number(c.penalty_amount), 0);
        const { error: sendError } = await resend.emails.send({
          from: RESEND_FROM_EMAIL,
          to: user.email,
          subject: `⚠️ ${(openCases ?? []).length} open BIR case${(openCases ?? []).length === 1 ? "" : "s"} — action required`,
          html: birGuardAlertEmailTemplate(profile?.full_name || user.name || "", (openCases ?? []).length, totalPenalty),
        });
        if (sendError) logError("bir-guard/cases POST: alert email send failed (non-fatal)", sendError);
      } catch (err) {
        logError("bir-guard/cases POST: alert email send threw (non-fatal)", err);
      }
    })();
  }

  return NextResponse.json({ case: data });
}
