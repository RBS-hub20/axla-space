import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { calculateTax, type TaxType } from "@/lib/tax-calculator";
import { logActivity } from "@/lib/dashboard/activity";
import { logError } from "@/lib/log-error";

const TAX_TYPES: TaxType[] = ["8%", "3%", "itemized"];

interface CalculateBody {
  income?: unknown;
  expenses?: unknown;
  taxType?: unknown;
  quarter?: unknown;
  year?: unknown;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canEditFilings) {
    return NextResponse.json({ error: "You don't have permission to compute filings." }, { status: 403 });
  }

  let body: CalculateBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const income = Number(body.income);
  const expenses = Number(body.expenses ?? 0);
  const taxType = body.taxType as TaxType;
  const quarter = Number(body.quarter);
  const year = Number(body.year);

  if (!Number.isFinite(income) || income < 0) {
    return NextResponse.json({ error: "Enter a valid income amount." }, { status: 400 });
  }
  if (!Number.isFinite(expenses) || expenses < 0) {
    return NextResponse.json({ error: "Enter a valid expenses amount." }, { status: 400 });
  }
  if (!TAX_TYPES.includes(taxType)) {
    return NextResponse.json({ error: "Invalid tax type." }, { status: 400 });
  }
  if (![1, 2, 3, 4].includes(quarter)) {
    return NextResponse.json({ error: "Invalid quarter." }, { status: 400 });
  }
  if (!Number.isFinite(year) || year < 2020 || year > 2100) {
    return NextResponse.json({ error: "Invalid year." }, { status: 400 });
  }

  const result = calculateTax({
    income,
    expenses,
    taxType,
    quarter: quarter as 1 | 2 | 3 | 4,
    year,
  });

  const { data, error } = await supabaseAdmin
    .from("tax_calculations")
    .insert({
      user_id: owner.ownerId,
      income,
      expenses,
      tax_type: taxType,
      quarter,
      year,
      tax_due: result.taxDue,
      surcharge: result.surcharge,
      interest: result.interest,
      is_late: result.isLate,
    })
    .select("id")
    .single();

  if (error) {
    logError("dashboard/calculate: insert failed", error);
    return NextResponse.json({ error: "Failed to save calculation." }, { status: 500 });
  }

  await logActivity(
    owner.ownerId,
    "tax_calculated",
    `Computed Q${quarter} ${year} tax (${taxType}): ₱${result.taxDue.toLocaleString(undefined, { maximumFractionDigits: 2 })} due`,
  );

  return NextResponse.json({ id: data.id, ...result });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canViewFilings) {
    return NextResponse.json({ error: "You don't have permission to view filings." }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("tax_calculations")
    .select("*")
    .eq("user_id", owner.ownerId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    logError("dashboard/calculate GET: query failed", error);
    return NextResponse.json({ error: "Failed to load calculations." }, { status: 500 });
  }

  return NextResponse.json({ calculations: data });
}
