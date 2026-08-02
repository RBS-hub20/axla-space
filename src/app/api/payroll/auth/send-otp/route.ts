import { NextResponse } from "next/server";
import { isResendConfigured, resend, RESEND_FROM_EMAIL } from "@/lib/resend";
import { otpEmailTemplate } from "@/lib/email-templates";
import { generateOtp, storeOtp } from "@/lib/otp-store";
import { prisma } from "@/lib/prisma";
import { logError } from "@/lib/log-error";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_SENDS = 5;

interface SendOtpBody {
  email?: unknown;
}

/**
 * Axla Payroll's own OTP sender — deliberately NOT a shared route with
 * /api/auth/send-otp, and deliberately does not import from it: TaxLaya's
 * waitlist gate (2-3 day approval queue) must stay completely unreachable
 * from this code path, not just "off by default" behind a flag on the
 * shared route, which would risk a future edit accidentally loosening it
 * for TaxLaya too. Payroll is a self-serve entry product — any email gets
 * a code immediately, no waitlist row is read or written at all.
 *
 * Verification reuses the EXISTING /api/auth/verify-otp unchanged (it
 * never checked the waitlist to begin with — see its own source — so it's
 * already product-agnostic and safe to share). Both products' users land
 * in the same Prisma User table either way, which is what makes "log in
 * with the same email on either product" work: this route and
 * /api/auth/send-otp both just gate *whether a code gets sent*, never
 * *which account it signs into*.
 *
 * Since removing the waitlist also removes TaxLaya's only real anti-spam
 * gate for this flow, a light per-email rate limit (5 sends/hour) stands
 * in as this route's own abuse guard — otherwise this would be an open
 * "email anyone a code" endpoint.
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
  const normalizedEmail = trimmedEmail.toLowerCase();
  const friendlyName = trimmedEmail.split("@")[0];

  try {
    const recentSends = await prisma.otpToken.count({
      where: { email: normalizedEmail, createdAt: { gt: new Date(Date.now() - RATE_LIMIT_WINDOW_MS) } },
    });
    if (recentSends >= RATE_LIMIT_MAX_SENDS) {
      return NextResponse.json({ error: "Too many codes requested — please wait a bit and try again." }, { status: 429 });
    }
  } catch (err) {
    logError("payroll/auth/send-otp: rate limit check failed (non-fatal, continuing)", err);
  }

  const code = generateOtp();

  try {
    await storeOtp(trimmedEmail, code);
  } catch (err) {
    logError("payroll/auth/send-otp: DB WRITE FAILED (storeOtp) — Resend was never called", err);
    return NextResponse.json({ success: true });
  }

  if (process.env.NODE_ENV !== "production") {
    console.log(`payroll/auth/send-otp: DEV — code for ${trimmedEmail} is ${code}`);
  }

  if (!isResendConfigured) {
    console.error("payroll/auth/send-otp: RESEND_API_KEY missing, code was stored but no email was sent");
    return NextResponse.json({ success: true });
  }

  try {
    const { error } = await resend.emails.send({
      from: RESEND_FROM_EMAIL,
      to: trimmedEmail,
      subject: `${code} is your Axla Payroll verification code`,
      html: otpEmailTemplate(code, friendlyName),
    });
    if (error) {
      logError("payroll/auth/send-otp: RESEND SEND FAILED (code was stored fine)", error);
    }
  } catch (err) {
    logError("payroll/auth/send-otp: RESEND SEND FAILED (code was stored fine)", err);
  }

  return NextResponse.json({ success: true });
}
