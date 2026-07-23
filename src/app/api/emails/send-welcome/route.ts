import { NextResponse } from "next/server";
import { isAdminRequestAuthorized } from "@/lib/admin";
import { resend, isResendConfigured, RESEND_FROM_EMAIL } from "@/lib/resend";
import { waitlistWelcomeEmailTemplate } from "@/lib/email-templates";
import { logError } from "@/lib/log-error";

interface SendWelcomeBody {
  email?: unknown;
  name?: unknown;
}

/**
 * Admin-gated resend/manual-trigger for the waitlist-welcome email — the
 * REAL automatic trigger is inline in src/app/api/waitlist/route.ts (fires
 * the moment someone joins), not this route. This exists for re-sending to
 * one address on request, without exposing an unauthenticated "email
 * anyone" endpoint.
 */
export async function POST(req: Request) {
  if (!(await isAdminRequestAuthorized())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }
  if (!isResendConfigured) {
    return NextResponse.json({ error: "RESEND_API_KEY isn't set." }, { status: 503 });
  }

  let body: SendWelcomeBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.email !== "string" || !body.email.trim()) {
    return NextResponse.json({ error: "email is required." }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name : "";

  const { error } = await resend.emails.send({
    from: RESEND_FROM_EMAIL,
    to: body.email.trim().toLowerCase(),
    subject: "You're on the Axla waitlist 🎉",
    html: waitlistWelcomeEmailTemplate(name),
  });

  if (error) {
    logError("emails/send-welcome: send failed", error);
    return NextResponse.json({ error: error.message || "Send failed." }, { status: 502 });
  }

  return NextResponse.json({ success: true });
}
