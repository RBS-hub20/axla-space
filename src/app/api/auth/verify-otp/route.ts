import { NextResponse } from "next/server";
import { isPlunkConfigured, plunk, PLUNK_FROM_EMAIL, PLUNK_FROM_NAME } from "@/lib/plunk";
import { welcomeEmailTemplate } from "@/lib/email-templates";
import { verifyOtp } from "@/lib/otp-store";
import { prisma } from "@/lib/prisma";
import { signSessionToken } from "@/lib/jwt";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { logError } from "@/lib/log-error";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_REGEX = /^\d{6}$/;
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

interface VerifyOtpBody {
  email?: unknown;
  code?: unknown;
  // /login sends both `code` and `otp` with the same value for safety —
  // accept either key.
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
    // The client still sees the generic 401 below (never leak internals to
    // an unauthenticated caller) — but this makes it obvious in server logs
    // that "invalid code" was actually a DB error, not a real wrong code.
    logError("verify-otp: DB READ FAILED (verifyOtp) — not a real invalid-code case", err);
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
    logError("verify-otp: DB WRITE FAILED (user upsert)", err);
    return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
  }

  let token: string;
  try {
    token = signSessionToken({ userId: user.id, email: user.email });
  } catch (err) {
    logError("verify-otp: JWT SIGNING FAILED (check JWT_SECRET)", err);
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
      logError("verify-otp: PLUNK WELCOME EMAIL FAILED (sign-in still succeeds)", err);
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
