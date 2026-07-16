import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";

/**
 * TODO: this only checks whether `taxlaya_session` is present — it does not
 * verify a signature or expiry (middleware runs on the Edge runtime, so it
 * can't use Prisma directly). Replace with real session verification
 * (NextAuth, or an edge-compatible signed JWT check) once that exists.
 * Today nothing ever sets this cookie, so every /dashboard request bounces
 * to /login — that's the intended fail-closed behavior until real
 * sign-in issuance is wired up.
 */
export function middleware(request: NextRequest) {
  const hasSession = request.cookies.has(SESSION_COOKIE);

  if (!hasSession) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
