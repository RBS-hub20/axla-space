import { NextResponse } from "next/server";
import { isPlunkConfigured, plunk, PLUNK_FROM_EMAIL, PLUNK_FROM_NAME } from "@/lib/plunk";
import { welcomeEmailTemplate } from "@/lib/email-templates";
import { verifyOtp } from "@/lib/otp-store";
import { prisma } from "@/lib/prisma";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const OTP_REGEX = /^\d{6}$/;

interface VerifyOtpBody {
  email?: unknown;
  otp?: unknown;
  name?: unknown;
}

export async function POST(req: Request) {
  let body: VerifyOtpBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
  }

  const { email, otp, name } = body;

  if (typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
    return NextResponse.json({ success: false, error: "A valid email is required." }, { status: 400 });
  }

  if (typeof otp !== "string" || !OTP_REGEX.test(otp.trim())) {
    return NextResponse.json({ success: false, error: "Enter the 6-digit code." }, { status: 400 });
  }

  if (typeof name !== "string" || !name.trim()) {
    return NextResponse.json({ success: false, error: "Name is required." }, { status: 400 });
  }

  const trimmedEmail = email.trim();
  const safeName = name.trim().slice(0, 100);

  let result;
  try {
    result = await verifyOtp(trimmedEmail, otp.trim());
  } catch (err) {
    console.error("verify-otp: failed to check OTP", err);
    return NextResponse.json(
      { success: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }

  if (!result.ok) {
    const message =
      result.reason === "expired"
        ? "This code has expired. Please request a new one."
        : "Incorrect code. Please check and try again.";
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }

  try {
    await prisma.user.upsert({
      where: { email: trimmedEmail },
      update: { name: safeName, verified: true },
      create: { email: trimmedEmail, name: safeName, verified: true },
    });
  } catch (err) {
    console.error("verify-otp: failed to upsert user", err);
    return NextResponse.json(
      { success: false, error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }

  if (isPlunkConfigured) {
    try {
      await plunk.emails.send({
        to: trimmedEmail,
        subject: "Welcome to TaxLaya 🎉",
        body: welcomeEmailTemplate(safeName),
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

  return NextResponse.json({ success: true });
}
