import { NextResponse } from "next/server";
import { getQuarterDeadline } from "@/lib/tax-calculator";

const PESO = (n: number) => `₱${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export async function POST(req: Request) {
  let body: { grossIncome?: unknown; quarter?: unknown; year?: unknown; taxRate?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const grossIncome = Number(body.grossIncome);
  if (!Number.isFinite(grossIncome) || grossIncome < 0) {
    return NextResponse.json({ error: "grossIncome must be a non-negative number." }, { status: 400 });
  }

  const quarterNum = Number(body.quarter);
  const quarter = ([1, 2, 3, 4] as const).includes(quarterNum as 1 | 2 | 3 | 4)
    ? (quarterNum as 1 | 2 | 3 | 4)
    : ((Math.floor(new Date().getMonth() / 3) + 1) as 1 | 2 | 3 | 4);
  const year = Number.isFinite(Number(body.year)) ? Number(body.year) : new Date().getFullYear();
  const taxRate = typeof body.taxRate === "number" && body.taxRate > 0 && body.taxRate <= 1 ? body.taxRate : 0.03;

  const taxDue = Math.round(grossIncome * taxRate * 100) / 100;

  // Single source of truth for the real 2551Q deadline schedule (25 days
  // after quarter end) — same function the rest of the app uses, so this
  // quick-calc endpoint can never drift from the real filing deadlines.
  const deadline = getQuarterDeadline("2551Q", quarter, year);

  return NextResponse.json({
    grossIncome,
    taxRate,
    taxDue,
    quarter,
    deadline: deadline.toISOString(),
    breakdown: [
      `Gross receipts: ${PESO(grossIncome)}`,
      `Percentage tax rate: ${(taxRate * 100).toFixed(0)}%`,
      `Tax due: ${PESO(taxDue)}`,
      `Filing deadline: ${deadline.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })}`,
    ],
  });
}
