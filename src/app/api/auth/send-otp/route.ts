import { NextResponse } from "next/server";
import { isResendConfigured, resend, RESEND_FROM_EMAIL } from "@/lib/resend";
import { otpEmailTemplate } from "@/lib/email-templates";
import { generateOtp, storeOtp } from "@/lib/otp-store";
import { logError } from "@/lib/log-error";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ADMIN_EMAIL = "renzsom2022@gmail.com";
const WAITLIST_MESSAGE =
  "You're on the waitlist! You're not approved yet. We'll email you when a slot opens. Current wait: 2-3 days.";

interface SendOtpBody {
  email?: unknown;
}

/**
 * Always responds `{ success: true }` regardless of whether the email is
 * well-formed, whether an account exists for it, or whether the send
 * actually succeeded — the response can't be used to probe which emails are
 * registered or valid. Real failures are logged server-side, not surfaced.
 */
export async function POST(req: Request) {
  let body: SendOtpBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: true });
  }

  const { email } = body;
  if (typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
    return NextResponse.json({ success: true });
  }

  const trimmedEmail = email.trim();
  const friendlyName = trimmedEmail.split("@")[0];
  const isAdminEmail = trimmedEmail.toLowerCase() === ADMIN_EMAIL;

  // Waitlist gate: everyone except the admin must have an 'approved' row in
  // public.waitlist before they can request a login code. Fails closed (403,
  // not a thrown 500) on any lookup error or misconfiguration — the admin
  // never touches this branch at all, so a Supabase hiccup can never lock
  // the admin out, only tighten the gate for everyone else.
  if (!isAdminEmail) {
    if (!isSupabaseAdminConfigured) {
      console.error("send-otp: Supabase admin not configured, blocking non-admin login");
      return NextResponse.json({ error: WAITLIST_MESSAGE }, { status: 403 });
    }

    try {
      const { data: waitlistEntry, error: waitlistError } = await supabaseAdmin
        .from("waitlist")
        .select("status")
        .eq("email", trimmedEmail)
        .maybeSingle();

      if (waitlistError) {
        logError("send-otp: waitlist check failed", waitlistError);
        return NextResponse.json({ error: WAITLIST_MESSAGE }, { status: 403 });
      }

      if (!waitlistEntry || waitlistEntry.status !== "approved") {
        return NextResponse.json({ error: WAITLIST_MESSAGE }, { status: 403 });
      }
    } catch (err) {
      logError("send-otp: waitlist check threw", err);
      return NextResponse.json({ error: WAITLIST_MESSAGE }, { status: 403 });
    }
  }

  const code = generateOtp();

  try {
    await storeOtp(trimmedEmail, code);
  } catch (err) {
    logError("send-otp: DB WRITE FAILED (storeOtp) — Resend was never called", err);
    return NextResponse.json({ success: true });
  }

  // Dev convenience: always print the code locally, regardless of whether
  // the real send below succeeds. Resend's sandbox mode (an unverified
  // `from` domain, e.g. onboarding@resend.dev) only delivers to the
  // account's own verified address — every other recipient 403s until a
  // real sending domain is verified at resend.com/domains. This line means
  // you can still test the full login flow locally against any email while
  // that's true, without weakening anything for real recipients: the actual
  // send attempt below still runs exactly the same either way.
  if (process.env.NODE_ENV !== "production") {
    console.log(`send-otp: DEV — code for ${trimmedEmail} is ${code}`);
  }

  if (!isResendConfigured) {
    console.error("send-otp: RESEND_API_KEY missing, code was stored but no email was sent");
    return NextResponse.json({ success: true });
  }

  try {
    const { error } = await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: trimmedEmail,
      subject: `${code} is your TaxLaya verification code`,
      html: otpEmailTemplate(code, friendlyName),
    });
    if (error) {
      logError("send-otp: RESEND SEND FAILED (code was stored fine)", error);
    }
  } catch (err) {
    logError("send-otp: RESEND SEND FAILED (code was stored fine)", err);
  }

  return NextResponse.json({ success: true });
}
