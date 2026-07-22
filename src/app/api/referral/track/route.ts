import { NextResponse } from "next/server";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

// Public, unauthenticated, analytics-only. Always resolves 200 — a visitor's
// page load must never fail or feel slower because click-logging hiccuped.
export async function POST(req: Request) {
  let body: { ref?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: true });
  }

  const ref = typeof body.ref === "string" ? body.ref.trim() : "";
  if (!ref) return NextResponse.json({ success: true });

  let refEmail: string | null = null;
  try {
    const decoded = Buffer.from(ref, "base64").toString("utf-8");
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(decoded)) refEmail = decoded.toLowerCase();
  } catch {
    // ref didn't decode — refEmail stays null, raw_ref still gets logged below.
  }

  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ success: true, stored: false });
  }

  try {
    const { error } = await supabaseAdmin.from("referral_clicks").insert({
      ref_email: refEmail,
      raw_ref: ref,
    });
    if (error) logError("referral/track: insert failed (non-fatal)", error);
  } catch (err) {
    logError("referral/track: insert threw (non-fatal)", err);
  }

  return NextResponse.json({ success: true });
}
