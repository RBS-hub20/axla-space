import { NextResponse } from "next/server";
import { isPlunkConfigured, plunk, PLUNK_FROM_EMAIL, PLUNK_FROM_NAME } from "@/lib/plunk";
import { welcomeEmailTemplate } from "@/lib/email-templates";
import { verifyOtp } from "@/lib/otp-store";
import { prisma } from "@/lib/prisma";
import { signSessionToken } from "@/lib/jwt";
import { SESSION_COOKIE } from "@/lib/session-cookie";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_REGEX = /^\d{6}$/;
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

interface VerifyOtpBody {
  email?: unknown;
  code?: unknown;
  // The live OTPForm posts the code under the key `otp`, not `code` — accept
  // both so this matches the already-shipped UI without touching it.
  otp?: unknown;
}

export async function POST(req: Request) {
  let body: VerifyOtpBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { email } = body;
  const rawCode = body.code ?? body.otp;

  if (typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
  }

  if (typeof rawCode !== "string" || !OTP_REGEX.test(rawCode.trim())) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
  }

  const trimmedEmail = email.trim().toLowerCase();
  const code = rawCode.trim();

  let result;
  try {
    result = await verifyOtp(trimmedEmail, code);
  } catch (err) {
    console.error("verify-otp: failed to check code", err);
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
  }

  if (!result.ok) {
    return NextResponse.json({ error: "Invalid or expired code" }, { status: 401 });
  }

  const friendlyName = trimmedEmail.split("@")[0];

  let user;
  try {
    user = await prisma.user.upsert({
      where: { email: trimmedEmail },
      update: { name: friendlyName, verified: true },
      create: { email: trimmedEmail, name: friendlyName, verified: true },
    });
  } catch (err) {
    console.error("verify-otp: failed to upsert user", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  let token: string;
  try {
    token = signSessionToken({ userId: user.id, email: user.email });
  } catch (err) {
    console.error("verify-otp: failed to sign session token", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  if (isPlunkConfigured) {
    try {
      await plunk.emails.send({
        to: trimmedEmail,
        subject: "Welcome to TaxLaya 🎉",
        body: welcomeEmailTemplate(user.name ?? friendlyName),
        type: "html",
        from: PLUNK_FROM_EMAIL,
        name: PLUNK_FROM_NAME,
      });
    } catch (err) {
      // Verification itself succeeded — a failed welcome email shouldn't
      // block sign-in, so log and continue instead of returning an error.
      console.error("verify-otp: welcome email failed to send", err);
    }
  }

  const response = NextResponse.json({
    success: true,
    user: { id: user.id, email: user.email, name: user.name },
  });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SEVEN_DAYS_SECONDS,
  });
  return response;
}
