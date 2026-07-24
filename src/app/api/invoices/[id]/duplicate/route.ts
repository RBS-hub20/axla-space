import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getUserPlan } from "@/lib/usage";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { claimNextInvoiceNumber } from "@/lib/dashboard/invoice-settings";
import { logError } from "@/lib/log-error";

const FREE_INVOICE_LIMIT = 3;

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const plan = await getUserPlan(user.email);
  if (plan === "free") {
    const { count } = await supabaseAdmin.from("invoices").select("id", { count: "exact", head: true }).eq("user_id", user.id);
    if ((count ?? 0) >= FREE_INVOICE_LIMIT) {
      return NextResponse.json(
        { error: `Free plan is limited to ${FREE_INVOICE_LIMIT} invoices.`, code: "UPGRADE_REQUIRED", upgrade_url: "/pricing" },
        { status: 403 },
      );
    }
  }

  const { data: source, error: fetchError } = await supabaseAdmin
    .from("invoices")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (fetchError || !source) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  const invoiceNumber = await claimNextInvoiceNumber(user.id);
  if (!invoiceNumber) {
    return NextResponse.json({ error: "Couldn't generate an invoice number. Try again." }, { status: 500 });
  }

  const { data, error } = await supabaseAdmin
    .from("invoices")
    .insert({
      user_id: user.id,
      invoice_number: invoiceNumber,
      client_name: source.client_name,
      client_email: source.client_email,
      client_tin: source.client_tin,
      client_address: source.client_address,
      business_info: source.business_info,
      items: source.items,
      subtotal: source.subtotal,
      tax_type: source.tax_type,
      tax_amount: source.tax_amount,
      total: source.total,
      currency: source.currency,
      payment_terms: source.payment_terms,
      due_date: source.due_date,
      notes: source.notes,
      payment_details: source.payment_details,
      status: "draft",
    })
    .select("*")
    .single();

  if (error || !data) {
    logError("invoices/[id]/duplicate POST: insert failed", error);
    return NextResponse.json({ error: "Failed to duplicate invoice." }, { status: 500 });
  }

  return NextResponse.json({ invoice: data });
}
