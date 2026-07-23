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

/**
 * Always resolves to a display-name-included sender ("Axla <hello@axla.space>"),
 * even if RESEND_FROM_EMAIL is only set to a bare address — a bare address
 * is passed through as-is if it already includes "<", so a fully custom
 * override still works, but the common case (just an email in the env var)
 * gets the "Axla <...>" format Resend/inboxes show to recipients.
 */
const rawFromEmail = process.env.RESEND_FROM_EMAIL || "hello@axla.space";
export const RESEND_FROM_EMAIL = rawFromEmail.includes("<") ? rawFromEmail : `Axla <${rawFromEmail}>`;
