import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

interface InvoiceItemRow {
  description: string;
  qty: number;
  rate: number;
  amount: number;
}

function csvEscape(value: unknown): string {
  const str = String(value ?? "");
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

/**
 * EIS export is a REFERENCE format, not a real BIR Electronic Invoicing
 * System submission — BIR hasn't published a public EIS submission API for
 * small taxpayers as of this writing, and this app has no such integration.
 * The field names below are a placeholder shape (invoiceNumber, sellerTIN,
 * buyerTIN, amount, vat) matching what RR 11-2024 e-invoices are expected
 * to carry, so the export is ready to adapt once BIR's actual schema is
 * public — not a claim that this is already wired to BIR.
 */
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const { data: invoice, error } = await supabaseAdmin
    .from("invoices")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error || !invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  const format = new URL(req.url).searchParams.get("format") === "csv" ? "csv" : "json";
  const businessInfo = (invoice.business_info as Record<string, unknown>) ?? {};
  const items = (invoice.items as InvoiceItemRow[]) ?? [];

  if (format === "csv") {
    const header = ["Invoice #", "Client", "Description", "Qty", "Rate", "Amount", "Currency", "Status", "Date"];
    const rows = items.map((it) => [
      invoice.invoice_number,
      invoice.client_name,
      it.description,
      it.qty,
      it.rate,
      it.amount,
      invoice.currency,
      invoice.status,
      invoice.created_at,
    ]);
    const csv = [header, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${invoice.invoice_number}.csv"`,
      },
    });
  }

  const eisJson = {
    _disclaimer: "EIS-Ready reference format for future BIR EIS submission when mandatory. Not currently transmitted to BIR — see RR 11-2024.",
    invoiceNumber: invoice.invoice_number,
    issueDate: invoice.created_at,
    dueDate: invoice.due_date,
    seller: {
      name: businessInfo.businessName ?? null,
      tin: businessInfo.tin ?? null,
      address: businessInfo.address ?? null,
    },
    buyer: {
      name: invoice.client_name,
      tin: invoice.client_tin,
      address: invoice.client_address,
    },
    lineItems: items.map((it) => ({ description: it.description, quantity: it.qty, unitPrice: it.rate, amount: it.amount })),
    currency: invoice.currency,
    subtotal: Number(invoice.subtotal),
    vatAmount: Number(invoice.tax_amount),
    taxType: invoice.tax_type === "vat" ? "VAT_12" : "NON_VAT",
    totalAmount: Number(invoice.total),
    status: invoice.status,
  };

  return NextResponse.json(eisJson, {
    headers: { "Content-Disposition": `attachment; filename="${invoice.invoice_number}-eis.json"` },
  });
}
