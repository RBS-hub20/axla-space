import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { listMyMemberships, getEffectiveOwner } from "@/lib/team";

/** Accounts the current user can switch into, plus which one is currently active — powers the dashboard account switcher. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ memberships: [], active: { ownerId: user.id, isOwner: true } });
  }

  const [memberships, active] = await Promise.all([listMyMemberships(user), getEffectiveOwner(user)]);

  return NextResponse.json({
    memberships,
    active: { ownerId: active.ownerId, isOwner: active.isOwner, role: active.role },
  });
}
