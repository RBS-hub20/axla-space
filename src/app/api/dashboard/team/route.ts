import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getUserPlan } from "@/lib/usage";
import { getOrCreateProfile } from "@/lib/dashboard/profile";
import { isResendConfigured, resend, RESEND_FROM_EMAIL } from "@/lib/resend";
import { teamInviteEmailTemplate } from "@/lib/email-templates";
import { logError } from "@/lib/log-error";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function requireBusinessPlan(email: string) {
  const plan = await getUserPlan(email);
  return plan === "business";
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

  const { data, error } = await supabaseAdmin
    .from("team_invites")
    .select("id, invited_email, role, status, created_at")
    .eq("owner_user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    logError("dashboard/team GET: query failed", error);
    return NextResponse.json({ error: "Failed to load invites." }, { status: 500 });
  }

  return NextResponse.json({ invites: data ?? [] });
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
  const role = body.role === "accountant" ? "accountant" : "member";

  const { count } = await supabaseAdmin
    .from("team_invites")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", user.id)
    .eq("status", "pending");
  if ((count ?? 0) >= 5) {
    return NextResponse.json({ error: "Business plan supports up to 5 team members." }, { status: 400 });
  }

  const { data: invite, error: insertError } = await supabaseAdmin
    .from("team_invites")
    .insert({ owner_user_id: user.id, invited_email: email, role })
    .select("id, invited_email, role, status, created_at")
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
        html: teamInviteEmailTemplate(ownerName, role),
      });
      if (sendError) logError("dashboard/team POST: resend send failed", sendError);
    } catch (err) {
      logError("dashboard/team POST: resend send threw", err);
    }
  }

  return NextResponse.json({ invite });
}
