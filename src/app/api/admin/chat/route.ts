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
    .from("chat_messages")
    .select("id, ip, message, created_at")
    .order("created_at", { ascending: false })
    .limit(5000);

  if (error) {
    return NextResponse.json({ error: "Failed to load chat messages." }, { status: 500 });
  }

  return NextResponse.json({ messages: data });
}
