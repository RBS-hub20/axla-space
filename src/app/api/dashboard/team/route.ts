import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getUserPlan } from "@/lib/usage";
import { getOrCreateProfile } from "@/lib/dashboard/profile";
import { isResendConfigured, resend, RESEND_FROM_EMAIL } from "@/lib/resend";
import { teamInviteEmailTemplate } from "@/lib/email-templates";
import { logError } from "@/lib/log-error";
import { isInvitableRole, ROLE_LABELS } from "@/lib/team";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireBusinessPlan(email: string) {
  const plan = await getUserPlan(email);
  return plan === "business";
}

function acceptUrl(token: string) {
  return `https://www.axla.space/team/accept?token=${token}`;
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!(await requireBusinessPlan(user.email))) {
    return NextResponse.json(
      { code: "LIMIT_REACHED", type: "business", message: "Team invites are a Business plan feature.", upgrade_url: "/dashboard/settings" },
      { status: 403 },
    );
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const [invitesResult, membersResult] = await Promise.all([
    supabaseAdmin
      .from("team_invites")
      .select("id, invited_email, role, status, token, expires_at, created_at")
      .eq("owner_user_id", user.id)
      .order("created_at", { ascending: false }),
    supabaseAdmin
      .from("team_members")
      .select("id, invited_email, role, status, joined_at")
      .eq("owner_user_id", user.id)
      .eq("status", "active")
      .order("joined_at", { ascending: false }),
  ]);

  if (invitesResult.error) {
    logError("dashboard/team GET: invites query failed", invitesResult.error);
    return NextResponse.json({ error: "Failed to load invites." }, { status: 500 });
  }
  if (membersResult.error) {
    logError("dashboard/team GET: members query failed", membersResult.error);
    return NextResponse.json({ error: "Failed to load team members." }, { status: 500 });
  }

  const invites = (invitesResult.data ?? []).map((i) => ({
    ...i,
    accept_url: i.status === "pending" ? acceptUrl(i.token) : null,
  }));

  return NextResponse.json({ invites, members: membersResult.data ?? [] });
}

interface InviteBody {
  email?: unknown;
  role?: unknown;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!(await requireBusinessPlan(user.email))) {
    return NextResponse.json(
      { code: "LIMIT_REACHED", type: "business", message: "Team invites are a Business plan feature.", upgrade_url: "/dashboard/settings" },
      { status: 403 },
    );
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  let body: InviteBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
  }
  if (email === user.email.toLowerCase()) {
    return NextResponse.json({ error: "You can't invite yourself." }, { status: 400 });
  }
  const role = isInvitableRole(body.role) ? body.role : "accountant";

  const { count: pendingCount } = await supabaseAdmin
    .from("team_invites")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", user.id)
    .eq("status", "pending");
  const { count: memberCount } = await supabaseAdmin
    .from("team_members")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", user.id)
    .eq("status", "active");
  if ((pendingCount ?? 0) + (memberCount ?? 0) >= 5) {
    return NextResponse.json({ error: "Business plan supports up to 5 team members." }, { status: 400 });
  }

  const { data: invite, error: insertError } = await supabaseAdmin
    .from("team_invites")
    .insert({ owner_user_id: user.id, invited_email: email, role })
    .select("id, invited_email, role, status, token, expires_at, created_at")
    .single();

  if (insertError) {
    logError("dashboard/team POST: insert failed", insertError);
    return NextResponse.json({ error: "Failed to create invite." }, { status: 500 });
  }

  if (isResendConfigured) {
    const profile = await getOrCreateProfile(user.id, user.email, user.name ?? user.email.split("@")[0]);
    const ownerName = profile?.full_name || user.name || user.email;
    try {
      const { error: sendError } = await resend.emails.send({
        from: RESEND_FROM_EMAIL,
        to: email,
        subject: `${ownerName} invited you to Axla TaxLaya`,
        html: teamInviteEmailTemplate(ownerName, ROLE_LABELS[role], acceptUrl(invite.token)),
      });
      if (sendError) logError("dashboard/team POST: resend send failed", sendError);
    } catch (err) {
      logError("dashboard/team POST: resend send threw", err);
    }
  }

  return NextResponse.json({ invite: { ...invite, accept_url: acceptUrl(invite.token) } });
}
