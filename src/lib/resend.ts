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

const SAFE_FALLBACK_FROM = "hello@axla.space";

/**
 * Always resolves to a display-name-included sender ("Axla <hello@axla.space>"),
 * even if RESEND_FROM_EMAIL is only set to a bare address — a bare address
 * is passed through as-is if it already includes "<", so a fully custom
 * override still works, but the common case (just an email in the env var)
 * gets the "Axla <...>" format Resend/inboxes show to recipients.
 *
 * `onboarding@resend.dev` is Resend's own sandbox sender — real accounts
 * without a verified sending domain default to it, and Resend then
 * restricts delivery to only the account owner's own inbox. It should
 * never be the "From" address shown to a real customer regardless of
 * environment, so this overrides it unconditionally (not just in
 * production — there's no scenario where a real user-facing branded email
 * should come from a testing domain) rather than gating on NODE_ENV, which
 * can vary unexpectedly across Vercel's Preview/Production runtimes.
 */
const rawFromEmail = (process.env.RESEND_FROM_EMAIL || SAFE_FALLBACK_FROM).trim();
const usesSandboxDomain = /resend\.dev/i.test(rawFromEmail);
if (usesSandboxDomain) {
  console.warn(
    `RESEND_FROM_EMAIL="${rawFromEmail}" uses Resend's sandbox domain (resend.dev) — overriding to "${SAFE_FALLBACK_FROM}" ` +
      "so real customers actually receive email. Set RESEND_FROM_EMAIL to a verified axla.space address to stop seeing this warning.",
  );
}
const resolvedFromEmail = usesSandboxDomain || !rawFromEmail ? SAFE_FALLBACK_FROM : rawFromEmail;
export const RESEND_FROM_EMAIL = resolvedFromEmail.includes("<") ? resolvedFromEmail : `Axla <${resolvedFromEmail}>`;
