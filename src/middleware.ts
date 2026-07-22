import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/session-cookie";

/**
 * TODO: this only checks whether `taxlaya_session` is present — it does not
 * verify a signature or expiry (middleware runs on the Edge runtime, so it
 * can't use Prisma directly). Real verification happens in `getCurrentUser()`
 * (src/lib/session.ts) on the server component/route side; this is just a
 * fast, edge-safe redirect for the common case of no cookie at all.
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
