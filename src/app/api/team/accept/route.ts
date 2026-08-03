import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";
import { ROLE_LABELS, getInviteByToken, INVITE_TOKEN_RE, type TeamRole } from "@/lib/team";

interface InviteRow {
  id: string;
  owner_user_id: string;
  invited_email: string;
  role: TeamRole;
  status: "pending" | "accepted" | "revoked";
  expires_at: string;
}

async function loadInvite(token: string): Promise<{ invite: InviteRow | null; error: unknown }> {
  const { data, error } = await supabaseAdmin
    .from("team_invites")
    .select("id, owner_user_id, invited_email, role, status, expires_at")
    .eq("token", token)
    .maybeSingle();
  return { invite: (data as InviteRow | null) ?? null, error };
}

/** Public — no login required. Lets the accept page show "who invited you as what" before asking someone to sign in. */
export async function GET(req: Request) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const token = new URL(req.url).searchParams.get("token")?.trim() ?? "";
  if (!INVITE_TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "Invalid invite link." }, { status: 400 });
  }

  const lookup = await getInviteByToken(token);
  if (lookup.state === "not_found") {
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  }

  return NextResponse.json({
    ownerName: lookup.ownerName,
    role: lookup.role,
    roleLabel: lookup.role ? ROLE_LABELS[lookup.role] : "",
    invitedEmail: lookup.invitedEmail,
    state: lookup.state,
  });
}

interface AcceptBody {
  token?: unknown;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  let body: AcceptBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!INVITE_TOKEN_RE.test(token)) {
    return NextResponse.json({ error: "Invalid invite link." }, { status: 400 });
  }

  const { invite, error: loadError } = await loadInvite(token);
  if (loadError) {
    logError("team/accept POST: invite lookup failed", loadError);
    return NextResponse.json({ error: "Failed to load invite." }, { status: 500 });
  }
  if (!invite) {
    return NextResponse.json({ error: "Invite not found." }, { status: 404 });
  }
  if (invite.owner_user_id === user.id) {
    return NextResponse.json({ error: "You can't accept your own invite." }, { status: 400 });
  }

  if (invite.status === "accepted") {
    // Idempotent: a reload/double-click after already accepting shouldn't error, as long as the resulting membership is still active.
    const { data: existing } = await supabaseAdmin
      .from("team_members")
      .select("id, status")
      .eq("invite_id", invite.id)
      .eq("member_user_id", user.id)
      .maybeSingle();
    if (existing?.status === "active") {
      return NextResponse.json({ ownerId: invite.owner_user_id, role: invite.role });
    }
    return NextResponse.json({ error: "This invite was already accepted by someone else." }, { status: 409 });
  }
  if (invite.status === "revoked") {
    return NextResponse.json({ error: "This invite has been revoked." }, { status: 410 });
  }
  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: "This invite has expired." }, { status: 410 });
  }

  const { error: memberError } = await supabaseAdmin.from("team_members").insert({
    owner_user_id: invite.owner_user_id,
    member_user_id: user.id,
    invited_email: invite.invited_email,
    role: invite.role,
    invite_id: invite.id,
  });
  if (memberError) {
    logError("team/accept POST: team_members insert failed", memberError);
    return NextResponse.json({ error: "Failed to accept invite." }, { status: 500 });
  }

  const { error: updateError } = await supabaseAdmin
    .from("team_invites")
    .update({ status: "accepted" })
    .eq("id", invite.id)
    .eq("status", "pending");
  if (updateError) {
    logError("team/accept POST: invite status update failed", updateError);
    // Membership row already exists at this point — access is granted even if this status flip fails; not worth failing the request over.
  }

  return NextResponse.json({ ownerId: invite.owner_user_id, role: invite.role });
}
