import "server-only";
import { prisma } from "@/lib/prisma";

const OTP_TTL_MS = 10 * 60 * 1000;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/** Stores a fresh OTP for the email. Earlier unused codes for that email are left alone
 * (they'll just fail the `used: false` + `code` match once superseded) but expire on
 * their own 10-minute clock, so there's no cleanup needed here. */
export async function storeOtp(email: string, code: string): Promise<void> {
  await prisma.otpToken.create({
    data: {
      email: normalizeEmail(email),
      code,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });
}

export type VerifyOtpResult = { ok: true } | { ok: false };

/**
 * Verifies the code and marks it used — codes are single-use. Returns a
 * single generic failure reason (not found / expired / already used /
 * mismatched) so the API response can't be used to distinguish between them.
 */
export async function verifyOtp(email: string, code: string): Promise<VerifyOtpResult> {
  const normalizedEmail = normalizeEmail(email);

  const entry = await prisma.otpToken.findFirst({
    where: {
      email: normalizedEmail,
      code,
      used: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!entry) {
    return { ok: false };
  }

  await prisma.otpToken.update({
    where: { id: entry.id },
    data: { used: true },
  });

  return { ok: true };
}
