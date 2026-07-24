import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

const VALID_STATUSES = ["draft", "sent", "paid"];

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin.from("invoices").select("*").eq("id", params.id).eq("user_id", user.id).maybeSingle();
  if (error) {
    logError("invoices/[id] GET: query failed", error);
    return NextResponse.json({ error: "Failed to load invoice." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }
  return NextResponse.json({ invoice: data });
}

interface PatchBody {
  status?: unknown;
  taxIncluded?: unknown;
  clientName?: unknown;
  clientEmail?: unknown;
  clientTin?: unknown;
  clientAddress?: unknown;
  notes?: unknown;
  paymentDetails?: unknown;
  dueDate?: unknown;
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof body.status === "string" && VALID_STATUSES.includes(body.status)) updates.status = body.status;
  if (typeof body.taxIncluded === "boolean") updates.tax_included = body.taxIncluded;
  if (typeof body.clientName === "string" && body.clientName.trim()) updates.client_name = body.clientName.trim();
  if (typeof body.clientEmail === "string") updates.client_email = body.clientEmail.trim() || null;
  if (typeof body.clientTin === "string") updates.client_tin = body.clientTin.trim() || null;
  if (typeof body.clientAddress === "string") updates.client_address = body.clientAddress.trim() || null;
  if (typeof body.notes === "string") updates.notes = body.notes.trim() || null;
  if (typeof body.paymentDetails === "object" && body.paymentDetails) updates.payment_details = body.paymentDetails;
  if (typeof body.dueDate === "string") updates.due_date = body.dueDate || null;

  const { data, error } = await supabaseAdmin
    .from("invoices")
    .update(updates)
    .eq("id", params.id)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error || !data) {
    logError("invoices/[id] PATCH: update failed", error);
    return NextResponse.json({ error: "Failed to update invoice." }, { status: 500 });
  }

  return NextResponse.json({ invoice: data });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const { error } = await supabaseAdmin.from("invoices").delete().eq("id", params.id).eq("user_id", user.id);
  if (error) {
    logError("invoices/[id] DELETE: delete failed", error);
    return NextResponse.json({ error: "Failed to delete invoice." }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
