import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/admin-session";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase/admin";

export async function GET() {
  const session = cookies().get(ADMIN_SESSION_COOKIE)?.value;
  if (!verifySessionToken(session)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin
    .from("waitlist")
    .select("id, email, bir_hate_level, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load waitlist." }, { status: 500 });
  }

  return NextResponse.json({ signups: data });
}
