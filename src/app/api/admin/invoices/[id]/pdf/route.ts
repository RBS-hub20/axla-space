import { NextResponse } from "next/server";
import { isAdminRequestAuthorized } from "@/lib/admin";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { generateInvoicePDF, type InvoiceItem } from "@/lib/pdf/invoice";
import { logError } from "@/lib/log-error";

const LOGO_BUCKET = "invoice-logos";

/** Same generation logic as /api/invoices/pdf, but scoped to admin (any user's invoice, not just the caller's own). */
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  if (!(await isAdminRequestAuthorized())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const { data: invoice, error } = await supabaseAdmin.from("invoices").select("*").eq("id", params.id).maybeSingle();
  if (error || !invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  const businessInfo = (invoice.business_info as Record<string, unknown>) ?? {};
  let logoBytes: Uint8Array | null = null;
  const logoPath = typeof businessInfo.logoUrl === "string" ? businessInfo.logoUrl : null;
  if (logoPath) {
    const { data: logoBlob, error: logoError } = await supabaseAdmin.storage.from(LOGO_BUCKET).download(logoPath);
    if (logoError) {
      logError("admin/invoices/[id]/pdf GET: logo download failed (non-fatal)", logoError);
    } else if (logoBlob) {
      logoBytes = new Uint8Array(await logoBlob.arrayBuffer());
    }
  }

  try {
    const bytes = await generateInvoicePDF({
      invoiceNumber: invoice.invoice_number,
      date: invoice.created_at,
      dueDate: invoice.due_date,
      paymentTerms: invoice.payment_terms,
      businessName: typeof businessInfo.businessName === "string" ? businessInfo.businessName : "Your Business",
      businessTin: typeof businessInfo.tin === "string" ? businessInfo.tin : null,
      businessAddress: typeof businessInfo.address === "string" ? businessInfo.address : null,
      businessEmail: typeof businessInfo.email === "string" ? businessInfo.email : null,
      businessPhone: typeof businessInfo.phone === "string" ? businessInfo.phone : null,
      logoBytes,
      clientName: invoice.client_name,
      clientEmail: invoice.client_email,
      clientTin: invoice.client_tin,
      clientAddress: invoice.client_address,
      items: (invoice.items as InvoiceItem[]) ?? [],
      subtotal: Number(invoice.subtotal),
      taxType: invoice.tax_type,
      taxAmount: Number(invoice.tax_amount),
      total: Number(invoice.total),
      currency: invoice.currency,
      notes: invoice.notes,
      paymentDetails: (invoice.payment_details as Record<string, unknown>) ?? {},
    });

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${invoice.invoice_number}.pdf"`,
      },
    });
  } catch (err) {
    logError("admin/invoices/[id]/pdf GET: generation failed", err);
    return NextResponse.json({ error: "Couldn't generate the PDF." }, { status: 500 });
  }
}
