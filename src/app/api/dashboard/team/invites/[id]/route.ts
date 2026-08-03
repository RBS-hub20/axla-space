import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

interface RouteParams {
  params: { id: string };
}

/** Revokes a pending invite. Owner-only — checked via owner_user_id match, same as every other team route. */
export async function DELETE(_req: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin
    .from("team_invites")
    .update({ status: "revoked" })
    .eq("id", params.id)
    .eq("owner_user_id", user.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (error) {
    logError("dashboard/team/invites/[id] DELETE: update failed", error);
    return NextResponse.json({ error: "Failed to revoke invite." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Invite not found or already resolved." }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}
