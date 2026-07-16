import "server-only";
import Plunk from "@plunk/node";

const apiKey = process.env.PLUNK_API_KEY;

/** True when PLUNK_API_KEY is set. Routes should check this before sending email. */
export const isPlunkConfigured = Boolean(apiKey);

if (!apiKey) {
  console.error(
    "PLUNK_API_KEY is not set — OTP and welcome emails will not be sent. " +
      "Get a key from your Plunk project settings and add it to .env.local.",
  );
}

/**
 * Server-only Plunk client for transactional email (OTP, welcome).
 * Constructed with a placeholder key when unconfigured so importing this
 * module never throws — callers must check `isPlunkConfigured` before
 * calling `plunk.emails.send()`, mirroring the fail-open pattern used by
 * `src/lib/supabase/admin.ts`.
 */
export const plunk = new Plunk(apiKey || "plunk-not-configured");

export const PLUNK_FROM_EMAIL = process.env.PLUNK_FROM_EMAIL || "hello@axla.space";
export const PLUNK_FROM_NAME = process.env.PLUNK_FROM_NAME || "TaxLaya";
