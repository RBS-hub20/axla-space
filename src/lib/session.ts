import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import type { User } from "@prisma/client";

import { SESSION_COOKIE } from "@/lib/session-cookie";

export { SESSION_COOKIE };

/**
 * Looks up the signed-in user from the `taxlaya_session` cookie.
 *
 * TODO: replace with real session issuance — NextAuth, or a signed JWT /
 * opaque token backed by a Prisma `Session` table. Right now nothing sets
 * this cookie (verify-otp doesn't issue one yet), so this always returns
 * null in practice. Once something does set it, note that this treats the
 * cookie's raw value as a Prisma `User` id with no signature or expiry
 * check — fine as an inert placeholder, but NOT safe to rely on as-is:
 * anyone could set their own `taxlaya_session` cookie to another user's id
 * and be treated as that user. Verify a signed/opaque token here before
 * anything actually issues this cookie.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const userId = cookies().get(SESSION_COOKIE)?.value;
  if (!userId) return null;

  try {
    return await prisma.user.findUnique({ where: { id: userId } });
  } catch (err) {
    // A DB error here should still fail closed (no verified user), not 500
    // the whole /dashboard route.
    console.error("getCurrentUser: Prisma lookup failed", err);
    return null;
  }
});
