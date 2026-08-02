import { NextResponse } from "next/server";
import { getPayMongoCheckoutSessionStatus, isPayMongoConfigured } from "@/lib/payments";
import { generateNegosyoExcel, type NegosyoTrackerData } from "@/lib/excel/negosyo-generator";
import { CATEGORY_KEYS } from "@/lib/excel/category-config";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

interface DownloadBody {
  checkoutSessionId?: unknown;
  businessName?: unknown;
  category?: unknown;
  products?: unknown;
  mayUtang?: unknown;
}

function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9\s_-]/g, "").trim().replace(/\s+/g, "_").slice(0, 60) || "Negosyo";
}

/**
 * Records one payments-ledger row for a Negosyo Tracker sale, keyed on the
 * PayMongo payment id so repeat "download ulit" clicks (the product
 * explicitly allows unlimited re-downloads after paying once) never insert
 * a second row and double-count revenue. Deliberately does NOT touch
 * subscriptions — this is a one-time purchase, not a recurring plan, and
 * must never trigger the PRO-activation behavior that
 * /api/webhooks/paymongo's isPaid branch has.
 */
async function recordSaleOnce(paymentId: string | null, businessName: string) {
  if (!isSupabaseAdminConfigured) return;
  try {
    if (paymentId) {
      const { data: existing } = await supabaseAdmin
        .from("payments")
        .select("id")
        .eq("provider_payment_id", paymentId)
        .maybeSingle();
      if (existing) return;
    }
    // No email is collected in this no-account flow — a clearly-marked
    // placeholder satisfies payments.email's NOT NULL constraint without
    // ever being used as a real send-to address (nothing in this route or
    // elsewhere emails this value).
    const placeholderEmail = `negosyo-tracker+${(paymentId ?? Date.now().toString()).slice(0, 40)}@axla.space`;
    const { error } = await supabaseAdmin.from("payments").insert({
      email: placeholderEmail,
      amount: 149,
      currency: "PHP",
      status: "paid",
      provider: "paymongo",
      provider_payment_id: paymentId,
      plan: "negosyo-tracker",
      product: "negosyo_tracker",
    });
    if (error) logError("negosyo-tracker/download: payments insert failed (non-fatal)", error);
    else console.log(`negosyo-tracker/download: sale recorded — business="${businessName}" paymentId=${paymentId ?? "(none)"}`);
  } catch (err) {
    logError("negosyo-tracker/download: recordSaleOnce threw (non-fatal)", err);
  }
}

export async function POST(req: Request) {
  if (!isPayMongoConfigured) {
    return NextResponse.json({ error: "Payments aren't set up yet. Please try again later." }, { status: 503 });
  }

  let body: DownloadBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const checkoutSessionId = typeof body.checkoutSessionId === "string" ? body.checkoutSessionId.trim() : "";
  if (!checkoutSessionId) {
    return NextResponse.json({ error: "Missing checkout session." }, { status: 400 });
  }

  const businessName = typeof body.businessName === "string" && body.businessName.trim() ? body.businessName.trim().slice(0, 80) : "Aking Negosyo";
  const category = typeof body.category === "string" && (CATEGORY_KEYS as string[]).includes(body.category) ? body.category : "Other";
  const mayUtang = Boolean(body.mayUtang);
  const products = Array.isArray(body.products) ? body.products.filter((p): p is string => typeof p === "string").slice(0, 20) : [];

  // The only trustworthy source of truth: ask PayMongo directly whether this
  // checkout session was actually paid, rather than trusting anything the
  // client claims. This is what makes it safe that Excel generation lives
  // entirely server-side — a client can't just call the generator with
  // fabricated "paid" data from devtools.
  const status = await getPayMongoCheckoutSessionStatus(checkoutSessionId);
  if (!status.paid) {
    return NextResponse.json(
      { error: "Hindi pa nakumpirma ang bayad. Kung nakabayad ka na, sandali lang at i-try ulit.", paid: false },
      { status: 402 },
    );
  }

  await recordSaleOnce(status.paymentId, businessName);

  const data: NegosyoTrackerData = { businessName, category, products, mayUtang };

  try {
    const buffer = await generateNegosyoExcel(data);
    const filename = `${sanitizeFilenamePart(businessName)}_Negosyo_Tracker_Axla.xlsx`;
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    logError("negosyo-tracker/download: Excel generation failed", err);
    return NextResponse.json({ error: "Nagka-error sa paggawa ng file. Please try again." }, { status: 500 });
  }
}
