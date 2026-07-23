import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { resend, isResendConfigured, RESEND_FROM_EMAIL } from "@/lib/resend";
import { birGuardAlertEmailTemplate } from "@/lib/email-templates";
import { logError } from "@/lib/log-error";

interface AlertBody {
  caseId?: unknown;
}

/**
 * Manual/resend trigger for the BIR Guard penalty alert — the REAL
 * automatic trigger is inline in src/app/api/bir-guard/cases/route.ts's
 * POST handler (fires right after a penalty case is saved). Scoped to the
 * caller's own case, same access rule as the rest of BIR Guard (PRO only).
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured || !isResendConfigured) {
    return NextResponse.json({ error: "Not configured yet." }, { status: 503 });
  }

  let body: AlertBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.caseId !== "string" || !body.caseId) {
    return NextResponse.json({ error: "caseId is required." }, { status: 400 });
  }

  const [{ data: birCase }, { data: openCases }, { data: profile }] = await Promise.all([
    supabaseAdmin.from("bir_open_cases").select("*").eq("id", body.caseId).eq("user_id", user.id).maybeSingle(),
    supabaseAdmin.from("bir_open_cases").select("penalty_amount").eq("user_id", user.id).neq("status", "filed"),
    supabaseAdmin.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
  ]);

  if (!birCase) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  const totalPenalty = (openCases ?? []).reduce((sum, c) => sum + Number(c.penalty_amount), 0);

  const { error } = await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to: user.email,
    subject: `⚠️ ${(openCases ?? []).length} open BIR case${(openCases ?? []).length === 1 ? "" : "s"} — action required`,
    html: birGuardAlertEmailTemplate(profile?.full_name || user.name || "", (openCases ?? []).length, totalPenalty),
  });

  if (error) {
    logError("emails/bir-guard-alert: send failed", error);
    return NextResponse.json({ error: error.message || "Send failed." }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
