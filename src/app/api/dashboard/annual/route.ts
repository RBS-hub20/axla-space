import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getUserPlan } from "@/lib/usage";
import { computeGraduatedAnnualTax } from "@/lib/tax-calculator";
import { logError } from "@/lib/log-error";

/**
 * Real annual summary computed from the year's actual quarterly
 * tax_calculations — not a replica of the official BIR Form 1701 (that's a
 * specific government form with its own exact line items I'd need to
 * verify against the real form before asserting field-by-field; this is a
 * genuine, data-backed overview to work from, not a fill-in-and-file form).
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canViewFilings) {
    return NextResponse.json({ error: "You don't have permission to view filings." }, { status: 403 });
  }

  const plan = await getUserPlan(owner.ownerEmail);
  if (plan !== "business") {
    return NextResponse.json(
      {
        code: "LIMIT_REACHED",
        type: "business",
        message: "Annual ITR summary is a Business plan feature.",
        upgrade_url: "/dashboard/settings",
      },
      { status: 403 },
    );
  }

  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const year = Number(new URL(req.url).searchParams.get("year")) || new Date().getFullYear();

  const { data, error } = await supabaseAdmin
    .from("tax_calculations")
    .select("quarter, income, expenses, tax_type, tax_due")
    .eq("user_id", owner.ownerId)
    .eq("year", year)
    .order("quarter", { ascending: true });

  if (error) {
    logError("dashboard/annual: query failed", error);
    return NextResponse.json({ error: "Failed to load annual data." }, { status: 500 });
  }

  const rows = data ?? [];
  const quarters = [1, 2, 3, 4].map((q) => {
    // Latest calculation for that quarter, if the user computed more than once.
    const matches = rows.filter((r) => r.quarter === q);
    const latest = matches[matches.length - 1] ?? null;
    return {
      quarter: q,
      income: latest ? Number(latest.income) : 0,
      expenses: latest ? Number(latest.expenses) : 0,
      taxDue: latest ? Number(latest.tax_due) : 0,
      taxType: latest?.tax_type ?? null,
      hasData: Boolean(latest),
    };
  });

  const annualIncome = quarters.reduce((s, q) => s + q.income, 0);
  const annualExpenses = quarters.reduce((s, q) => s + q.expenses, 0);
  const quarterlyTaxPaid = quarters.reduce((s, q) => s + q.taxDue, 0);
  const annualGraduatedEstimate = computeGraduatedAnnualTax(Math.max(0, annualIncome - annualExpenses));

  return NextResponse.json({
    year,
    quarters,
    annualIncome,
    annualExpenses,
    quarterlyTaxPaid,
    annualGraduatedEstimate,
    balanceEstimate: annualGraduatedEstimate - quarterlyTaxPaid,
  });
}
