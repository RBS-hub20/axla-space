import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getPayrollPlan } from "@/lib/payroll/plan";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const plan = await getPayrollPlan(user.email);
  return NextResponse.json({ plan, hasAccess: plan !== null });
}
