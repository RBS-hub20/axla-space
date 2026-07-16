import { createHmac, timingSafeEqual } from "crypto";

export const ADMIN_SESSION_COOKIE = "axla_admin_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getSecret(): string | undefined {
  return process.env.ADMIN_PASSWORD;
}

function sign(value: string, secret: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}

/**
 * Creates a signed session token: `${expiresAt}.${signature}`. The signature
 * is an HMAC of the expiry keyed by ADMIN_PASSWORD, so only the server (which
 * knows ADMIN_PASSWORD) can mint or validate a token — no session store needed.
 */
export function createSessionToken(): string | null {
  const secret = getSecret();
  if (!secret) return null;

  const expiresAt = Date.now() + SESSION_TTL_MS;
  const signature = sign(String(expiresAt), secret);
  return `${expiresAt}.${signature}`;
}

export function verifySessionToken(token: string | undefined | null): boolean {
  const secret = getSecret();
  if (!secret || !token) return false;

  const [expiresAtRaw, signature] = token.split(".");
  if (!expiresAtRaw || !signature) return false;

  const expiresAt = Number(expiresAtRaw);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) return false;

  const expectedSignature = sign(expiresAtRaw, secret);
  const expectedBuf = Buffer.from(expectedSignature, "hex");
  const actualBuf = Buffer.from(signature, "hex");

  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}

export function verifyPassword(password: string): boolean {
  const secret = getSecret();
  if (!secret) return false;

  const expectedBuf = Buffer.from(secret);
  const actualBuf = Buffer.from(password);

  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
