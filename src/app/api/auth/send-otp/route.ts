import { NextResponse } from "next/server";
import { isPlunkConfigured, plunk, PLUNK_FROM_EMAIL, PLUNK_FROM_NAME } from "@/lib/plunk";
import { otpEmailTemplate } from "@/lib/email-templates";
import { generateOtp, storeOtp } from "@/lib/otp-store";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const code = generateOtp();

  try {
    await storeOtp(trimmedEmail, code);

    if (isPlunkConfigured) {
      await plunk.emails.send({
        to: trimmedEmail,
        subject: "Your TaxLaya Login Code",
        body: otpEmailTemplate(code, friendlyName),
        type: "html",
        from: PLUNK_FROM_EMAIL,
        name: PLUNK_FROM_NAME,
      });
    } else {
      console.error("send-otp: PLUNK_API_KEY missing, code was stored but no email was sent");
    }
  } catch (err) {
    console.error("send-otp: failed to store/send OTP", err);
  }

  return NextResponse.json({ success: true });
}
