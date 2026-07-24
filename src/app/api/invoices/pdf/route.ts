import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { generateInvoicePDF, type InvoiceItem } from "@/lib/pdf/invoice";
import { logError } from "@/lib/log-error";

const LOGO_BUCKET = "invoice-logos";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing invoice id." }, { status: 400 });
  }

  const { data: invoice, error } = await supabaseAdmin.from("invoices").select("*").eq("id", id).eq("user_id", user.id).maybeSingle();
  if (error || !invoice) {
    return NextResponse.json({ error: "Invoice not found." }, { status: 404 });
  }

  const businessInfo = (invoice.business_info as Record<string, unknown>) ?? {};
  let logoBytes: Uint8Array | null = null;
  const logoPath = typeof businessInfo.logoUrl === "string" ? businessInfo.logoUrl : null;
  if (logoPath) {
    const { data: logoBlob, error: logoError } = await supabaseAdmin.storage.from(LOGO_BUCKET).download(logoPath);
    if (logoError) {
      logError("invoices/pdf GET: logo download failed (non-fatal, using placeholder)", logoError);
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
    logError("invoices/pdf GET: generation failed", err);
    return NextResponse.json({ error: "Couldn't generate the PDF. Please try again." }, { status: 500 });
  }
}
