import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { signSessionToken } from "@/lib/jwt";
import { SESSION_COOKIE } from "@/lib/session-cookie";
import { provisionNewSignup } from "@/lib/auth/provision-signup";

export async function POST(req: NextRequest) {
  try {
    const { email, code } = await req.json();
    if (!email ||!code) {
      return NextResponse.json({ error: "Email and code required" }, { status: 400 });
    }

    const otpRecord = await prisma.otpToken.findFirst({
      where: { email, code, used: false },
      orderBy: { createdAt: 'desc' }
    });

    if (!otpRecord) {
      return NextResponse.json({ error: "Invalid code" }, { status: 400 });
    }

    if (new Date() > otpRecord.expiresAt) {
      return NextResponse.json({ error: "Code expired" }, { status: 400 });
    }

    let user = await prisma.user.findUnique({ where: { email } });
    const isNewUser = !user;
    if (!user) {
      user = await prisma.user.create({
        data: { email, name: email.split('@')[0], verified: true }
      });
    } else if (!user.verified) {
      user = await prisma.user.update({
        where: { id: user.id },
        data: { verified: true }
      });
    }

    await prisma.otpToken.update({
      where: { id: otpRecord.id },
      data: { used: true }
    }).catch(() => {});

    // Free signup launch: auto-creates a default free-tier business (zero
    // empty state on first dashboard visit) and grants a 30-day Pro trial
    // if this email was on the waitlist. Only for a brand-new account —
    // never re-runs on a returning login. Never throws (see its own
    // internal error handling) and never blocks login on failure.
    if (isNewUser) {
      await provisionNewSignup(user.id, user.email, user.name ?? email.split('@')[0]);
    }

    const token = signSessionToken({ userId: user.id, email: user.email });

    const res = NextResponse.json({ success: true, user });
    res.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 7,
      path: "/"
    });

    return res;
  } catch (e: any) {
    console.error("VERIFY OTP ERROR:", e);
    return NextResponse.json({ error: e.message || "Something went wrong" }, { status: 500 });
  }
}
