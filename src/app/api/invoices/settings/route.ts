import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getOrCreateInvoiceSettings } from "@/lib/dashboard/invoice-settings";
import { logError } from "@/lib/log-error";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const settings = await getOrCreateInvoiceSettings(user.id);
  if (!settings) {
    return NextResponse.json({ error: "Failed to load settings." }, { status: 500 });
  }
  return NextResponse.json({ settings });
}

interface PutBody {
  prefix?: unknown;
  defaultTerms?: unknown;
  defaultNotes?: unknown;
}

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  await getOrCreateInvoiceSettings(user.id);

  let body: PutBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.prefix === "string" && body.prefix.trim()) updates.prefix = body.prefix.trim().toUpperCase().slice(0, 10);
  if (typeof body.defaultTerms === "string") updates.default_terms = body.defaultTerms.trim() || null;
  if (typeof body.defaultNotes === "string") updates.default_notes = body.defaultNotes.trim() || null;

  const { data, error } = await supabaseAdmin.from("invoice_settings").update(updates).eq("user_id", user.id).select("*").single();
  if (error || !data) {
    logError("invoices/settings PUT: update failed", error);
    return NextResponse.json({ error: "Failed to save settings." }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}
