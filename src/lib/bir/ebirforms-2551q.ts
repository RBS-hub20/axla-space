/**
 * IMPORTANT — read before trusting the "importable" framing anywhere this
 * is used:
 *
 * BIR's actual Offline eBIRForms desktop app only *produces* an XML file —
 * you fill the form inside their own software, click "Final Copy," and it
 * writes out an ENCRYPTED xml (named `<TIN+branch><formNo><period>.xml`).
 * There is no documented feature in eBIRForms for importing an externally
 * generated XML or DAT file into a blank form — no public BIR
 * documentation, RMC, or job-aid describes a generic "File → Import" for
 * third-party data (checked BIR's own job-aid PDF, PwC/JuanTax/Taxumo
 * write-ups; none mention one). So despite "eBIRForms XML/DAT" in the
 * name, these exports are NOT guaranteed to open or auto-fill inside the
 * real eBIRForms app.
 *
 * What this genuinely is: a portable, structured export of the same 2551Q
 * figures Axla already computed — useful as a backup, for handing to an
 * accountant, or for quickly re-typing into the real eBIRForms app/BIR's
 * printed form without hunting through the dashboard. Always re-verify the
 * numbers in eBIRForms's own validation before submitting.
 *
 * ATC (Alphanumeric Tax Code): defaults to PT010 — "Persons exempt from
 * VAT under Sec. 109(BB)" / the standard 3% percentage tax code per BIR's
 * 2018 ATC revision (confirmed via BIR/PwC/JuanTax/Taxumo sources). NOT
 * "II012" — that prefix belongs to income tax forms, not 2551Q.
 */

import { formatIAF, generateFileName, AXLA_REF_FORMAT_VERSION } from "@/lib/bir/dat-formatter";

export interface EBIR2551QData {
  tin: string;
  rdoCode: string;
  name: string;
  address?: string;
  quarter: number;
  year: number;
  gross: number;
  taxDue: number;
  atc?: string;
}

export const DEFAULT_2551Q_ATC = "PT010";
const FORM_VERSION = "2551Qv2018";

/**
 * Normalizes a TIN to digits-only and pads a bare 9-digit TIN with the
 * head-office branch code "000" to reach 12 digits total (9-digit TIN +
 * 3-digit branch). Note: eBIRForms package 7.9.6.0 expanded the branch
 * code field from 3 to 5 digits for some forms — if your real TIN+branch
 * is longer, this will report invalid; double-check against your COR.
 */
export function normalizeTin(raw: string): { digits: string; isValid: boolean } {
  const digits = raw.replace(/\D/g, "");
  const normalized = digits.length === 9 ? `${digits}000` : digits;
  return { digits: normalized, isValid: normalized.length === 12 };
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateEBIR2551QXML(data: EBIR2551QData): string {
  const { digits: tin } = normalizeTin(data.tin);
  const atc = data.atc || DEFAULT_2551Q_ATC;
  const filingDate = new Date().toISOString().slice(0, 10);

  return `<?xml version="1.0" encoding="UTF-8"?>
<BIRForms>
  <Form2551Q version="${FORM_VERSION}">
    <TIN>${tin}</TIN>
    <RDOCode>${xmlEscape(data.rdoCode)}</RDOCode>
    <TaxPayerName>${xmlEscape(data.name)}</TaxPayerName>
    <Address>${xmlEscape(data.address || "")}</Address>
    <Quarter>${data.quarter}</Quarter>
    <Year>${data.year}</Year>
    <FilingDate>${filingDate}</FilingDate>
    <ATC>${xmlEscape(atc)}</ATC>
    <GrossSales>${data.gross.toFixed(2)}</GrossSales>
    <TaxDue>${data.taxDue.toFixed(2)}</TaxDue>
    <TotalAmountPayable>${data.taxDue.toFixed(2)}</TotalAmountPayable>
  </Form2551Q>
</BIRForms>
`;
}

/** Plain pipe-delimited fallback export — same fields, same order as the XML, for spreadsheets or manual cross-checking. */
export function generateEBIR2551QDAT(data: EBIR2551QData): string {
  const { digits: tin } = normalizeTin(data.tin);
  const atc = data.atc || DEFAULT_2551Q_ATC;
  const filingDate = new Date().toISOString().slice(0, 10);

  return [
    FORM_VERSION,
    tin,
    data.rdoCode,
    data.name,
    data.address || "",
    String(data.quarter),
    String(data.year),
    filingDate,
    atc,
    data.gross.toFixed(2),
    data.taxDue.toFixed(2),
    data.taxDue.toFixed(2),
  ].join("|");
}

export interface Generate2551QDatInput {
  tin: string;
  rdo: string;
  name: string;
  quarter: number;
  year: number;
  grossSales: number;
  taxRate: number; // e.g. 0.08 or 0.03
  taxDue: number;
  filingDate?: Date;
  prevGross?: number;
}

export interface Generate2551QDatResult {
  datContent: string;
  fileName: string;
  jsonDebug: Record<string, unknown>;
}

/**
 * Multi-record (header/detail/footer) structured reference export — same
 * "backup, accountant handoff, re-verify in eBIRForms" framing as
 * generateEBIR2551QDAT above, just a richer line-item layout instead of one
 * flat pipe-delimited row. See src/lib/bir/dat-formatter.ts for the format
 * itself and why it's an Axla-designed reference, not a BIR-published spec.
 */
export function generate2551QDat(input: Generate2551QDatInput): Generate2551QDatResult {
  const { digits: tin, isValid: tinValid } = normalizeTin(input.tin);
  const filingDate = input.filingDate ?? new Date();
  const filingDateStr = filingDate.toISOString().slice(0, 10).replace(/-/g, "");
  const period = `Q${input.quarter}`;
  const ratePct = `${Math.round(input.taxRate * 100)}%`;

  const datContent = formatIAF(
    { formType: "2551Q", tin, rdo: input.rdo, taxpayerName: input.name, period, year: input.year, filingDate: filingDateStr },
    [
      { label: "GrossSales", value: input.grossSales.toFixed(2) },
      { label: "TaxRate", value: ratePct },
      { label: "TaxDue", value: input.taxDue.toFixed(2) },
      ...(input.prevGross !== undefined ? [{ label: "PrevQuarterGross", value: input.prevGross.toFixed(2) }] : []),
    ],
    { lineCount: 1, totalGross: input.grossSales, totalTaxDue: input.taxDue },
  );

  const fileName = generateFileName("2551Q", period, input.year);

  const jsonDebug = {
    formType: "2551Q",
    tin,
    tinValid,
    rdo: input.rdo,
    name: input.name,
    quarter: input.quarter,
    year: input.year,
    grossSales: input.grossSales,
    taxRate: input.taxRate,
    taxRatePct: ratePct,
    taxDue: input.taxDue,
    prevGross: input.prevGross ?? null,
    filingDate: filingDateStr,
    formatVersion: AXLA_REF_FORMAT_VERSION,
    generatedAt: filingDate.toISOString(),
  };

  return { datContent, fileName, jsonDebug };
}
