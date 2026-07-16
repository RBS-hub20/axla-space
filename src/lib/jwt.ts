import "server-only";
import jwt from "jsonwebtoken";

const DEV_FALLBACK_SECRET = "taxlaya-dev-secret";
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

export interface SessionTokenPayload {
  userId: string;
  email: string;
}

function getSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;

  if (process.env.NODE_ENV === "production") {
    // Signing/verifying with a secret that's published in chat logs and
    // source history would let anyone forge a session for any user — refuse
    // instead of silently using it in production. The literal fallback
    // string is still used in dev so local sign-in works without extra setup.
    throw new Error(
      "JWT_SECRET is not set. Refusing to use the 'taxlaya-dev-secret' fallback in production.",
    );
  }

  console.warn("JWT_SECRET is not set — signing with the insecure dev fallback secret.");
  return DEV_FALLBACK_SECRET;
}

/** Signs a 7-day session token: `{ userId, email, exp }`. */
export function signSessionToken(payload: SessionTokenPayload): string {
  const exp = Math.floor(Date.now() / 1000) + SEVEN_DAYS_SECONDS;
  return jwt.sign({ ...payload, exp }, getSecret());
}

/** Verifies a session token, returning its payload or null if invalid/expired/unsigned. */
export function verifySessionToken(token: string): SessionTokenPayload | null {
  try {
    const decoded = jwt.verify(token, getSecret());
    if (typeof decoded !== "object" || decoded === null) return null;

    const { userId, email } = decoded as Record<string, unknown>;
    if (typeof userId !== "string" || typeof email !== "string") return null;

    return { userId, email };
  } catch {
    return null;
  }
}
