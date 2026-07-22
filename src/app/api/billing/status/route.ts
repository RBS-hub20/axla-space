import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getUserPlan } from "@/lib/usage";

/**
 * Thin read of the same subscriptions-backed plan every usage limit and
 * upgrade wall in the app already checks (see src/lib/usage.ts). Deliberately
 * NOT a separate is_pro flag — a second, independent "is this user paid"
 * signal is how you end up with a customer who paid and still sees "free"
 * somewhere else in the app.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const plan = await getUserPlan(user.email);
  return NextResponse.json({ is_pro: plan !== "free", plan });
}
