import { NextResponse } from "next/server";
import { isAdminRequestAuthorized } from "@/lib/admin";
import { resend, isResendConfigured, RESEND_FROM_EMAIL } from "@/lib/resend";
import { welcomeEmailTemplate } from "@/lib/email-templates";
import { logError } from "@/lib/log-error";

/**
 * Diagnostic-only: confirms the Resend domain/key actually work by sending
 * one real email — using the actual shared template (dark header, official
 * logo, dark body), not standalone inline HTML, so this genuinely exercises
 * what every other template looks like. Admin-gated — a public "send an
 * email to anyone" route with no auth would be a spam-relay risk.
 */
export async function POST() {
  if (!(await isAdminRequestAuthorized())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }
  if (!isResendConfigured) {
    return NextResponse.json({ error: "RESEND_API_KEY isn't set." }, { status: 503 });
  }

  const { data, error } = await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to: "renzsom2022@gmail.com",
    subject: "Axla email test — domain + dark logo header working ✅",
    html: welcomeEmailTemplate("Renmar"),
  });

  if (error) {
    logError("emails/test: send failed", error);
    return NextResponse.json({ error: error.message || "Send failed." }, { status: 502 });
  }

  return NextResponse.json({ success: true, id: data?.id });
}
