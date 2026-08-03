import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getOrRotateShopSettings } from "@/lib/payroll/shop-settings";
import { logError } from "@/lib/log-error";

// getCurrentUser() below reads cookies(), which already opts this route out
// of static rendering — declared explicitly anyway (see the same note in
// employee/by-token/route.ts) since the daily_code must never be served
// from a stale cached render.
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canViewPayroll) {
    return NextResponse.json({ error: "You don't have permission to view payroll." }, { status: 403 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  try {
    const settings = await getOrRotateShopSettings(owner.ownerId);
    return NextResponse.json({ settings });
  } catch (err) {
    logError("payroll/shop/settings GET: failed", err);
    return NextResponse.json({ error: "Failed to load shop settings." }, { status: 500 });
  }
}
