import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";
import { ACTIVE_TEAM_OWNER_COOKIE } from "@/lib/team";

interface SwitchBody {
  ownerId?: unknown;
}

/** Sets (or clears) which account's data the dashboard should read/write. Re-validates membership server-side rather than trusting the client — a bogus ownerId here just fails, it never grants access on its own (getEffectiveOwner() re-checks team_members on every request regardless). */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  let body: SwitchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const ownerId = typeof body.ownerId === "string" ? body.ownerId.trim() : "";

  const res = NextResponse.json({ success: true });

  if (!ownerId || ownerId === user.id) {
    res.cookies.set(ACTIVE_TEAM_OWNER_COOKIE, "", { maxAge: 0, path: "/" });
    return res;
  }

  const { data: membership, error } = await supabaseAdmin
    .from("team_members")
    .select("id")
    .eq("owner_user_id", ownerId)
    .eq("member_user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (error) {
    logError("team/switch POST: membership lookup failed", error);
    return NextResponse.json({ error: "Failed to switch account." }, { status: 500 });
  }
  if (!membership) {
    return NextResponse.json({ error: "You don't have access to that account." }, { status: 403 });
  }

  res.cookies.set(ACTIVE_TEAM_OWNER_COOKIE, ownerId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 30,
    path: "/",
  });
  return res;
}
