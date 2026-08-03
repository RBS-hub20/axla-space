import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { calculateTax } from "@/lib/tax-calculator";

interface CompareBody {
  income?: unknown;
  expenses?: unknown;
  quarter?: unknown;
  year?: unknown;
}

/**
 * "What-if" preview only — computes both 8% and graduated/itemized side by
 * side for the same income/expenses, without saving anything to
 * tax_calculations. Doesn't cover 3% since that's mutually exclusive with
 * 8% by VAT-registration status, not a real alternative most users are
 * choosing between the way 8% vs graduated is.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canViewFilings) {
    return NextResponse.json({ error: "You don't have permission to view filings." }, { status: 403 });
  }

  let body: CompareBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const income = Number(body.income);
  const expenses = Number(body.expenses ?? 0);
  const quarter = Number(body.quarter);
  const year = Number(body.year);

  if (!Number.isFinite(income) || income < 0) {
    return NextResponse.json({ error: "Enter a valid income amount." }, { status: 400 });
  }
  if (!Number.isFinite(expenses) || expenses < 0) {
    return NextResponse.json({ error: "Enter a valid expenses amount." }, { status: 400 });
  }
  if (![1, 2, 3, 4].includes(quarter)) {
    return NextResponse.json({ error: "Invalid quarter." }, { status: 400 });
  }
  if (!Number.isFinite(year) || year < 2020 || year > 2100) {
    return NextResponse.json({ error: "Invalid year." }, { status: 400 });
  }

  const eightPercent = calculateTax({ income, expenses: 0, taxType: "8%", quarter: quarter as 1 | 2 | 3 | 4, year });
  const graduated = calculateTax({ income, expenses, taxType: "itemized", quarter: quarter as 1 | 2 | 3 | 4, year });

  const savings = graduated.taxDue - eightPercent.taxDue;
  const recommended: "8%" | "itemized" = savings >= 0 ? "8%" : "itemized";

  return NextResponse.json({ eightPercent, graduated, savings: Math.abs(savings), recommended });
}
