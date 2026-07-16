import { NextResponse } from "next/server";
import { isPlunkConfigured, plunk, PLUNK_FROM_EMAIL, PLUNK_FROM_NAME } from "@/lib/plunk";
import { otpEmailTemplate } from "@/lib/email-templates";
import { generateOtp, storeOtp } from "@/lib/otp-store";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SendOtpBody {
  email?: unknown;
  name?: unknown;
}

export async function POST(req: Request) {
  let body: SendOtpBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, error: "Invalid request body." }, { status: 400 });
  }

  const { email, name } = body;

  if (typeof email !== "string" || !EMAIL_REGEX.test(email.trim())) {
    return NextResponse.json({ success: false, error: "A valid email is required." }, { status: 400 });
  }

  if (!isPlunkConfigured) {
    console.error("send-otp: PLUNK_API_KEY missing, cannot send email");
    return NextResponse.json(
      { success: false, error: "Email service is not configured. Please try again later." },
      { status: 500 },
    );
  }

  const safeName = typeof name === "string" ? name.trim().slice(0, 100) : "";

  const otp = generateOtp();
  storeOtp(email, otp, safeName);

  try {
    await plunk.emails.send({
      to: email.trim(),
      subject: `Your TaxLaya code: ${otp}`,
      body: otpEmailTemplate(otp, safeName),
      type: "html",
      from: PLUNK_FROM_EMAIL,
      name: PLUNK_FROM_NAME,
    });
  } catch (err) {
    console.error("send-otp: Plunk send failed", err);
    return NextResponse.json(
      { success: false, error: "Could not send the code. Please try again in a moment." },
      { status: 502 },
    );
  }

  return NextResponse.json({ success: true });
}
