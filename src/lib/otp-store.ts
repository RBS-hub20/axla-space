import "server-only";

interface OtpEntry {
  otp: string;
  name: string;
  expiresAt: number;
}

const OTP_TTL_MS = 10 * 60 * 1000;

// TODO: swap this in-memory Map for a database table (e.g. Supabase) before
// production. A module-level Map only survives within a single warm server
// process — it's empty after every cold start/redeploy, and won't be shared
// across instances if this app ever runs on more than one server process.
// Fine for local dev and low-traffic testing, not for real multi-instance use.
const otpStore = new Map<string, OtpEntry>();

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export function storeOtp(email: string, otp: string, name: string): void {
  otpStore.set(normalizeEmail(email), {
    otp,
    name,
    expiresAt: Date.now() + OTP_TTL_MS,
  });
}

export type VerifyOtpResult =
  | { ok: true; name: string }
  | { ok: false; reason: "not_found" | "expired" | "mismatch" };

export function verifyOtp(email: string, otp: string): VerifyOtpResult {
  const key = normalizeEmail(email);
  const entry = otpStore.get(key);

  if (!entry) {
    return { ok: false, reason: "not_found" };
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(key);
    return { ok: false, reason: "expired" };
  }

  if (entry.otp !== otp) {
    return { ok: false, reason: "mismatch" };
  }

  otpStore.delete(key);
  return { ok: true, name: entry.name };
}
