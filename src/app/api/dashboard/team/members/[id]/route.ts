import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

interface RouteParams {
  params: { id: string };
}

/** Removes an active team member's access. Owner-only — this is what actually revokes shared access, since getEffectiveOwner() re-checks team_members.status on every request. */
export async function DELETE(_req: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin
    .from("team_members")
    .update({ status: "removed" })
    .eq("id", params.id)
    .eq("owner_user_id", user.id)
    .eq("status", "active")
    .select("id")
    .maybeSingle();

  if (error) {
    logError("dashboard/team/members/[id] DELETE: update failed", error);
    return NextResponse.json({ error: "Failed to remove team member." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Team member not found." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
