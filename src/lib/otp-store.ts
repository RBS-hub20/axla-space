import "server-only";
import { prisma } from "@/lib/prisma";

const OTP_TTL_MS = 10 * 60 * 1000;

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Stores a fresh OTP for the email, replacing any codes issued earlier —
 * only the most recently sent code should ever be valid.
 */
export async function storeOtp(email: string, otp: string): Promise<void> {
  const normalizedEmail = normalizeEmail(email);

  await prisma.oTP.deleteMany({ where: { email: normalizedEmail } });
  await prisma.oTP.create({
    data: {
      email: normalizedEmail,
      otp,
      expiresAt: new Date(Date.now() + OTP_TTL_MS),
    },
  });
}

export type VerifyOtpResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "expired" | "mismatch" };

/** Verifies the OTP and deletes it — codes are single-use either way. */
export async function verifyOtp(email: string, otp: string): Promise<VerifyOtpResult> {
  const normalizedEmail = normalizeEmail(email);
  const entry = await prisma.oTP.findFirst({
    where: { email: normalizedEmail },
    orderBy: { createdAt: "desc" },
  });

  if (!entry) {
    return { ok: false, reason: "not_found" };
  }

  if (entry.expiresAt < new Date()) {
    await prisma.oTP.deleteMany({ where: { email: normalizedEmail } });
    return { ok: false, reason: "expired" };
  }

  if (entry.otp !== otp) {
    return { ok: false, reason: "mismatch" };
  }

  await prisma.oTP.deleteMany({ where: { email: normalizedEmail } });
  return { ok: true };
}
