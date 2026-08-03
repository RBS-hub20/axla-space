import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getOrCreateProfile } from "@/lib/dashboard/profile";
import { resolveBusiness } from "@/lib/dashboard/businesses";
import { getFilingDeadline } from "@/lib/dashboard/quarter";
import { generateFormPdf } from "@/lib/pdf/generate-form-pdf";
import { logError } from "@/lib/log-error";
import { getUserPlan } from "@/lib/usage";
import type { TaxType } from "@/lib/tax-calculator";

interface RouteParams {
  params: { id: string };
}

function quarterDateRange(quarter: number, year: number): { start: string; end: string } {
  const startMonth = (quarter - 1) * 3; // 0-indexed
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 0)); // last day of the quarter
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export async function GET(_req: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canViewBirForms) {
    return NextResponse.json({ error: "You don't have permission to view forms." }, { status: 403 });
  }

  const { data: form, error: formError } = await supabaseAdmin
    .from("bir_forms")
    .select("*")
    .eq("id", params.id)
    .eq("user_id", owner.ownerId)
    .maybeSingle();

  if (formError) {
    logError("dashboard/forms/[id]/pdf: form query failed", formError);
    return NextResponse.json({ error: "Failed to load form." }, { status: 500 });
  }
  if (!form) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const profile = await getOrCreateProfile(
    owner.ownerId,
    owner.ownerEmail,
    owner.isOwner ? user.name ?? owner.ownerEmail.split("@")[0] : owner.ownerEmail.split("@")[0],
  );
  if (!profile) {
    return NextResponse.json({ error: "Failed to load profile." }, { status: 500 });
  }

  // Resolves to: the form's own business_id if set, else the owner's
  // primary business, else a synthetic business built from profile fields
  // (the explicit fallback the multi-business feature is required to keep).
  const business = await resolveBusiness(owner.ownerId, profile, form.business_id);

  // `form.data` is a snapshot of the tax_calculations row taken when the
  // form was created — frozen on purpose, so a filing reference doesn't
  // silently change if you recompute later. Fall back to a fresh lookup by
  // calculation_id only if that snapshot is somehow empty.
  let calc = (form.data ?? {}) as Record<string, unknown>;
  if (Object.keys(calc).length === 0 && form.calculation_id) {
    const { data: fresh } = await supabaseAdmin
      .from("tax_calculations")
      .select("*")
      .eq("id", form.calculation_id)
      .maybeSingle();
    if (fresh) calc = fresh;
  }

  const quarter = Number(calc.quarter) || 1;
  const year = Number(calc.year) || new Date().getFullYear();
  const taxType = ((calc.tax_type as TaxType) ?? profile.tax_type ?? "8%") as TaxType;
  const formType = form.form_type as "2551Q" | "1701Q" | "0619E";

  const deadline = getFilingDeadline(quarter as 1 | 2 | 3 | 4, year, formType === "2551Q" ? "2551Q" : "1701Q");

  // Sum of receipts marked deductible with a receipt_date inside this
  // quarter — informational only. It does NOT override the income/expenses
  // actually used for the saved tax_due, since silently swapping the
  // "official" total would make this PDF disagree with the calculation
  // that was actually run and recorded.
  const { start, end } = quarterDateRange(quarter, year);
  let receiptsQuery = supabaseAdmin
    .from("receipts")
    .select("amount")
    .eq("user_id", owner.ownerId)
    .eq("category", "deductible")
    .gte("receipt_date", start)
    .lte("receipt_date", end);
  if (business?.id) {
    receiptsQuery = receiptsQuery.eq("business_id", business.id);
  }
  const { data: receipts, error: receiptsError } = await receiptsQuery;

  if (receiptsError) {
    logError("dashboard/forms/[id]/pdf: receipts query failed (non-fatal)", receiptsError);
  }
  const deductibleReceiptsTotal =
    receipts && receipts.length > 0 ? receipts.reduce((sum, r) => sum + (Number(r.amount) || 0), 0) : null;

  const fullName = profile.full_name || (owner.isOwner ? user.name : null) || owner.ownerEmail;
  const plan = await getUserPlan(owner.ownerEmail);

  const pdfBytes = await generateFormPdf({
    formId: form.id,
    formType: form.form_type,
    status: form.status,
    filedAt: form.filed_at,
    isFreePlan: plan === "free",

    taxpayerName: fullName,
    tinNumber: business?.tin ?? null,
    rdoCode: business?.rdoCode ?? null,
    businessName: business?.name ?? null,
    branchCode: business?.branchCode ?? null,
    address: business?.address ?? null,
    taxType,

    quarter,
    year,
    deadline: deadline.toISOString(),

    income: Number(calc.income) || 0,
    expenses: Number(calc.expenses) || 0,
    deductibleReceiptsTotal,
    baseTax: Number(calc.tax_due) - Number(calc.surcharge || 0) - Number(calc.interest || 0),
    surcharge: Number(calc.surcharge) || 0,
    interest: Number(calc.interest) || 0,
    taxDue: Number(calc.tax_due) || 0,
    isLate: Boolean(calc.is_late),
  });

  const safeName = fullName.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "taxpayer";
  const filename = `BIR-${form.form_type}-Q${quarter}-${year}-${safeName}.pdf`;

  return new NextResponse(Buffer.from(pdfBytes), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${filename}"`,
    },
  });
}
