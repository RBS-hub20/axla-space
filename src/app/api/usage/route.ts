import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getUsageSummary } from "@/lib/usage";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const summary = await getUsageSummary(user.id, user.email);
  return NextResponse.json(summary);
}
