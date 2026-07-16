import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { verifySessionToken } from "@/lib/jwt";
import type { User } from "@prisma/client";

import { SESSION_COOKIE } from "@/lib/session-cookie";

export { SESSION_COOKIE };

/**
 * Looks up the signed-in user from the `taxlaya_session` cookie: verifies
 * the JWT (signature + expiry) and fetches the corresponding User by id.
 * Fails closed — any missing cookie, invalid/expired token, or DB error
 * returns null rather than throwing.
 */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = cookies().get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const payload = verifySessionToken(token);
  if (!payload) return null;

  try {
    return await prisma.user.findUnique({ where: { id: payload.userId } });
  } catch (err) {
    console.error("getCurrentUser: Prisma lookup failed", err);
    return null;
  }
});
