import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getOrCreateProfile } from "@/lib/dashboard/profile";
import { isResendConfigured, resend, RESEND_FROM_EMAIL } from "@/lib/resend";
import { teamInviteEmailTemplate } from "@/lib/email-templates";
import { logError } from "@/lib/log-error";
import { ROLE_LABELS, type TeamRole } from "@/lib/team";

interface RouteParams {
  params: { id: string };
}

/** Resends a pending invite's email and pushes its expiry out another 7 days from now. */
export async function POST(_req: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: invite, error } = await supabaseAdmin
    .from("team_invites")
    .update({ expires_at: expiresAt })
    .eq("id", params.id)
    .eq("owner_user_id", user.id)
    .eq("status", "pending")
    .select("id, invited_email, role, token")
    .maybeSingle();

  if (error) {
    logError("dashboard/team/invites/[id]/resend POST: update failed", error);
    return NextResponse.json({ error: "Failed to resend invite." }, { status: 500 });
  }
  if (!invite) {
    return NextResponse.json({ error: "Invite not found or already resolved." }, { status: 404 });
  }

  if (isResendConfigured) {
    const profile = await getOrCreateProfile(user.id, user.email, user.name ?? user.email.split("@")[0]);
    const ownerName = profile?.full_name || user.name || user.email;
    const acceptUrl = `https://www.axla.space/team/accept?token=${invite.token}`;
    try {
      const { error: sendError } = await resend.emails.send({
        from: RESEND_FROM_EMAIL,
        to: invite.invited_email,
        subject: `${ownerName} invited you to Axla TaxLaya`,
        html: teamInviteEmailTemplate(ownerName, ROLE_LABELS[invite.role as TeamRole], acceptUrl),
      });
      if (sendError) logError("dashboard/team/invites/[id]/resend POST: resend send failed", sendError);
    } catch (err) {
      logError("dashboard/team/invites/[id]/resend POST: resend send threw", err);
    }
  }

  return NextResponse.json({ success: true });
}
