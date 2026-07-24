import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getUserPlan } from "@/lib/usage";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { claimNextInvoiceNumber } from "@/lib/dashboard/invoice-settings";
import { logError } from "@/lib/log-error";

const FREE_INVOICE_LIMIT = 3;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    logError("invoices GET: query failed", error);
    return NextResponse.json({ error: "Failed to load invoices." }, { status: 500 });
  }

  const invoices = data ?? [];
  const plan = await getUserPlan(user.email);

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const thisMonth = invoices.filter((inv) => new Date(inv.created_at) >= monthStart);

  const totalInvoicedThisMonth = thisMonth.reduce((sum, inv) => sum + Number(inv.total), 0);
  const outstanding = invoices.filter((inv) => inv.status === "sent").reduce((sum, inv) => sum + Number(inv.total), 0);
  const paidThisMonth = thisMonth.filter((inv) => inv.status === "paid").reduce((sum, inv) => sum + Number(inv.total), 0);
  const freeInvoicesLeft = plan === "free" ? Math.max(0, FREE_INVOICE_LIMIT - invoices.length) : null;

  return NextResponse.json({
    invoices,
    stats: { totalInvoicedThisMonth, outstanding, paidThisMonth, freeInvoicesLeft },
    plan,
  });
}

interface InvoiceItemBody {
  description?: unknown;
  qty?: unknown;
  rate?: unknown;
}

interface InvoiceBody {
  clientName?: unknown;
  clientEmail?: unknown;
  clientTin?: unknown;
  clientAddress?: unknown;
  businessInfo?: unknown;
  items?: InvoiceItemBody[];
  taxType?: unknown;
  currency?: unknown;
  paymentTerms?: unknown;
  dueDate?: unknown;
  notes?: unknown;
  paymentDetails?: unknown;
  status?: unknown;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const plan = await getUserPlan(user.email);
  if (plan === "free") {
    const { count, error: countError } = await supabaseAdmin
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (countError) logError("invoices POST: count check failed (non-fatal, allowing)", countError);
    if ((count ?? 0) >= FREE_INVOICE_LIMIT) {
      return NextResponse.json(
        {
          error: `Free plan is limited to ${FREE_INVOICE_LIMIT} invoices. Upgrade to PRO ₱249/mo for unlimited invoices + EIS export + custom logo.`,
          code: "UPGRADE_REQUIRED",
          upgrade_url: "/pricing",
        },
        { status: 403 },
      );
    }
  }

  let body: InvoiceBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.clientName !== "string" || !body.clientName.trim()) {
    return NextResponse.json({ error: "Client name is required." }, { status: 400 });
  }

  const items = (Array.isArray(body.items) ? body.items : [])
    .map((it) => ({
      description: typeof it.description === "string" ? it.description.trim() : "",
      qty: Number(it.qty) || 0,
      rate: Number(it.rate) || 0,
    }))
    .filter((it) => it.description);

  if (items.length === 0) {
    return NextResponse.json({ error: "At least one line item is required." }, { status: 400 });
  }

  const itemsWithAmount = items.map((it) => ({ ...it, amount: Math.round(it.qty * it.rate * 100) / 100 }));
  const subtotal = itemsWithAmount.reduce((sum, it) => sum + it.amount, 0);
  const taxType = body.taxType === "vat" ? "vat" : "non_vat";
  const taxAmount = taxType === "vat" ? Math.round(subtotal * 0.12 * 100) / 100 : 0;
  const total = Math.round((subtotal + taxAmount) * 100) / 100;

  const invoiceNumber = await claimNextInvoiceNumber(user.id);
  if (!invoiceNumber) {
    return NextResponse.json({ error: "Couldn't generate an invoice number. Try again." }, { status: 500 });
  }

  const status = body.status === "sent" ? "sent" : "draft";

  const { data, error } = await supabaseAdmin
    .from("invoices")
    .insert({
      user_id: user.id,
      invoice_number: invoiceNumber,
      client_name: body.clientName.trim(),
      client_email: typeof body.clientEmail === "string" ? body.clientEmail.trim() || null : null,
      client_tin: typeof body.clientTin === "string" ? body.clientTin.trim() || null : null,
      client_address: typeof body.clientAddress === "string" ? body.clientAddress.trim() || null : null,
      business_info: typeof body.businessInfo === "object" && body.businessInfo ? body.businessInfo : {},
      items: itemsWithAmount,
      subtotal,
      tax_type: taxType,
      tax_amount: taxAmount,
      total,
      currency: typeof body.currency === "string" && body.currency.trim() ? body.currency.trim() : "PHP",
      payment_terms: Number(body.paymentTerms) || null,
      due_date: typeof body.dueDate === "string" && body.dueDate ? body.dueDate : null,
      notes: typeof body.notes === "string" ? body.notes.trim() || null : null,
      payment_details: typeof body.paymentDetails === "object" && body.paymentDetails ? body.paymentDetails : {},
      status,
    })
    .select("*")
    .single();

  if (error || !data) {
    logError("invoices POST: insert failed", error);
    return NextResponse.json({ error: "Failed to save invoice." }, { status: 500 });
  }

  return NextResponse.json({ invoice: data });
}
