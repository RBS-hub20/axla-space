import { NextResponse } from "next/server";
import { normalizeTin } from "@/lib/bir/ebirforms-2551q";
import { generateEBIR1701QXML, generateEBIR1701QDAT } from "@/lib/bir/ebirforms-1701q";
import { generateEBIR1701XML, generateEBIR1701DAT } from "@/lib/bir/ebirforms-1701";
import { generateEBIR0619EXML, generateEBIR0619EDAT, DEFAULT_0619E_ATC } from "@/lib/bir/ebirforms-0619e";
import { generateEBIR2307XML, generateEBIR2307DAT, DEFAULT_2307_ATC } from "@/lib/bir/ebirforms-2307";

type FormType = "1701Q" | "1701" | "0619E" | "2307";
const FORM_TYPES: FormType[] = ["1701Q", "1701", "0619E", "2307"];

interface ExportBody {
  formType?: unknown;
  format?: unknown;
  tin?: unknown;
  rdoCode?: unknown;
  name?: unknown;
  address?: unknown;
  gross?: unknown;
  taxDue?: unknown;
  quarter?: unknown;
  month?: unknown;
  year?: unknown;
  taxRate?: unknown;
  atc?: unknown;
  payorTin?: unknown;
  payorName?: unknown;
  payeeTin?: unknown;
  payeeName?: unknown;
}

function currentQuarter(): 1 | 2 | 3 | 4 {
  return (Math.floor(new Date().getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
}

/**
 * Generic export endpoint for the four BIR forms beyond 2551Q (which keeps
 * its own dedicated /api/bir/2551q/export — unchanged, still the primary
 * flow). Same "structured reference export, not a verified eBIRForms
 * import" framing throughout — see the generator files under
 * src/lib/bir/ebirforms-*.ts for the full caveat on each form.
 */
export async function POST(req: Request) {
  let body: ExportBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.formType !== "string" || !FORM_TYPES.includes(body.formType as FormType)) {
    return NextResponse.json({ error: `formType must be one of: ${FORM_TYPES.join(", ")}` }, { status: 400 });
  }
  const formType = body.formType as FormType;
  const format = body.format === "xml" || body.format === "dat" ? body.format : "both";
  const year = Number.isFinite(Number(body.year)) ? Number(body.year) : new Date().getFullYear();

  if (formType === "2307") {
    if (typeof body.payorTin !== "string" || !body.payorTin.trim()) {
      return NextResponse.json({ error: "payorTin is required." }, { status: 400 });
    }
    if (typeof body.payeeTin !== "string" || !body.payeeTin.trim()) {
      return NextResponse.json({ error: "payeeTin is required." }, { status: 400 });
    }
    if (!normalizeTin(body.payorTin).isValid || !normalizeTin(body.payeeTin).isValid) {
      return NextResponse.json({ error: "Both TINs must be 9 digits (plus optional 3-digit branch) — 12 digits total." }, { status: 400 });
    }
    const incomePayment = Number(body.gross);
    if (!Number.isFinite(incomePayment) || incomePayment < 0) {
      return NextResponse.json({ error: "gross (income payment) must be a non-negative number." }, { status: 400 });
    }
    const taxWithheld = Number.isFinite(Number(body.taxDue)) ? Number(body.taxDue) : 0;
    const quarter = ([1, 2, 3, 4] as const).includes(Number(body.quarter) as 1 | 2 | 3 | 4)
      ? (Number(body.quarter) as 1 | 2 | 3 | 4)
      : currentQuarter();

    const data = {
      payorTin: String(body.payorTin),
      payorName: typeof body.payorName === "string" && body.payorName.trim() ? body.payorName : "Not set",
      payeeTin: String(body.payeeTin),
      payeeName: typeof body.payeeName === "string" && body.payeeName.trim() ? body.payeeName : "Not set",
      rdoCode: typeof body.rdoCode === "string" ? body.rdoCode : "",
      quarter,
      year,
      incomePayment,
      taxWithheld,
      atc: typeof body.atc === "string" && body.atc.trim() ? body.atc : DEFAULT_2307_ATC,
    };
    const { digits: payeeTinDigits } = normalizeTin(data.payeeTin);
    const fileName = `2307_Q${quarter}_${year}_${payeeTinDigits}`;
    const result: { fileName: string; xmlContent?: string; datContent?: string } = { fileName };
    if (format === "xml" || format === "both") result.xmlContent = generateEBIR2307XML(data);
    if (format === "dat" || format === "both") result.datContent = generateEBIR2307DAT(data);
    return NextResponse.json(result);
  }

  // 1701Q, 1701, 0619E all share taxpayer identity fields.
  if (typeof body.tin !== "string" || !body.tin.trim()) {
    return NextResponse.json({ error: "TIN is required." }, { status: 400 });
  }
  const { digits: tin, isValid: tinValid } = normalizeTin(body.tin);
  if (!tinValid) {
    return NextResponse.json(
      { error: "TIN must be 9 digits (plus an optional 3-digit branch code) — 12 digits total." },
      { status: 400 },
    );
  }
  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "Taxpayer name is required." }, { status: 400 });
  }
  const gross = Number(body.gross);
  if (!Number.isFinite(gross) || gross < 0) {
    return NextResponse.json({ error: "gross must be a non-negative number." }, { status: 400 });
  }
  const rdoCode = typeof body.rdoCode === "string" ? body.rdoCode : "";
  const address = typeof body.address === "string" ? body.address : "";
  const taxRate: 0.08 | "graduated" = body.taxRate === 0.08 ? 0.08 : "graduated";
  const taxDue = Number.isFinite(Number(body.taxDue)) ? Number(body.taxDue) : Math.round(gross * 0.08 * 100) / 100;

  if (formType === "1701Q") {
    const quarter = ([1, 2, 3, 4] as const).includes(Number(body.quarter) as 1 | 2 | 3 | 4)
      ? (Number(body.quarter) as 1 | 2 | 3 | 4)
      : currentQuarter();
    const data = { tin, rdoCode, name: body.name, address, quarter, year, taxableIncome: gross, taxDue, taxRate };
    const fileName = `1701Q_Q${quarter}_${year}_${tin}`;
    const result: { fileName: string; xmlContent?: string; datContent?: string } = { fileName };
    if (format === "xml" || format === "both") result.xmlContent = generateEBIR1701QXML(data);
    if (format === "dat" || format === "both") result.datContent = generateEBIR1701QDAT(data);
    return NextResponse.json(result);
  }

  if (formType === "1701") {
    const data = {
      tin,
      rdoCode,
      name: body.name,
      address,
      year,
      annualGrossIncome: gross,
      annualTaxableIncome: gross,
      annualTaxDue: taxDue,
      taxRate,
    };
    const fileName = `1701_${year}_${tin}`;
    const result: { fileName: string; xmlContent?: string; datContent?: string } = { fileName };
    if (format === "xml" || format === "both") result.xmlContent = generateEBIR1701XML(data);
    if (format === "dat" || format === "both") result.datContent = generateEBIR1701DAT(data);
    return NextResponse.json(result);
  }

  // 0619E
  const month = Number.isFinite(Number(body.month)) && Number(body.month) >= 1 && Number(body.month) <= 12
    ? Number(body.month)
    : new Date().getMonth() + 1;
  const data = {
    tin,
    rdoCode,
    name: body.name,
    address,
    month,
    year,
    totalIncomePayments: gross,
    taxWithheld: taxDue,
    atc: typeof body.atc === "string" && body.atc.trim() ? body.atc : DEFAULT_0619E_ATC,
  };
  const fileName = `0619E_M${month}_${year}_${tin}`;
  const result: { fileName: string; xmlContent?: string; datContent?: string } = { fileName };
  if (format === "xml" || format === "both") result.xmlContent = generateEBIR0619EXML(data);
  if (format === "dat" || format === "both") result.datContent = generateEBIR0619EDAT(data);
  return NextResponse.json(result);
}
