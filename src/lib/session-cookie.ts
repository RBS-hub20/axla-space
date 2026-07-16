// Just the cookie name — kept dependency-free (no Prisma, no next/headers) so
// middleware.ts (edge runtime) can import it without pulling in Node-only
// code. src/lib/session.ts re-exports this for server component use.
export const SESSION_COOKIE = "taxlaya_session";
