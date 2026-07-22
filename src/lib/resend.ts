import "server-only";
import { Resend } from "resend";

const apiKey = process.env.RESEND_API_KEY;

/** True when RESEND_API_KEY is set. Routes should check this before sending email. */
export const isResendConfigured = Boolean(apiKey);

if (!apiKey) {
  console.error(
    "RESEND_API_KEY is not set — OTP and welcome emails will not be sent. " +
      "Get a key from your Resend dashboard and add it to .env.local.",
  );
}

/**
 * Server-only Resend client for transactional email (OTP, welcome).
 * Constructed with a placeholder key when unconfigured so imports never
 * throws — callers must check `isResendConfigured` before calling
 * `resend.emails.send()`, mirroring the fail-open pattern used by
 * `src/lib/supabase/admin.ts`.
 */
export const resend = new Resend(apiKey || "re_not_configured");

export const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || "hello@axla.space";
