import { NextResponse } from "next/server";
import { getWaitlistStats } from "@/lib/waitlist-stats";

export const revalidate = 60;

/**
 * Public, unauthenticated: returns only an aggregate count + average — no
 * emails, no individual rows, no PII — so the landing page can show real
 * social-proof numbers instead of a made-up figure.
 */
export async function GET() {
  const stats = await getWaitlistStats();
  return NextResponse.json(stats);
}
