/**
 * IMPORTANT — same caveat as ebirforms-2551q.ts and ebirforms-1701q.ts:
 * BIR's real Offline eBIRForms app has no documented generic file-import
 * feature, so this export is NOT guaranteed to open or auto-fill inside
 * the real eBIRForms app.
 *
 * What this genuinely is: a portable, structured export of the ANNUAL
 * 1701 figures Axla already computed (sum of the year's quarterly income
 * and tax due, per the same records already tracked for 1701Q) — a
 * backup, a handoff to an accountant, or a faster re-type into the real
 * eBIRForms app. This is a first-pass field mapping (it doesn't model
 * itemized deductions, multiple income sources, or the full annual ITR
 * schedule set) — always re-verify in eBIRForms before submitting.
 */

import { normalizeTin } from "@/lib/bir/ebirforms-2551q";

export interface EBIR1701Data {
  tin: string;
  rdoCode: string;
  name: string;
  address?: string;
  year: number;
  annualGrossIncome: number;
  annualTaxableIncome: number;
  annualTaxDue: number;
  taxRate?: 0.08 | "graduated";
}

const FORM_VERSION = "1701v2018";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateEBIR1701XML(data: EBIR1701Data): string {
  const { digits: tin } = normalizeTin(data.tin);
  const filingDate = new Date().toISOString().slice(0, 10);
  const rateLabel = data.taxRate === 0.08 ? "8% Flat Rate" : "Graduated Rates";

  return `<?xml version="1.0" encoding="UTF-8"?>
<BIRForms>
  <Form1701 version="${FORM_VERSION}">
    <TIN>${tin}</TIN>
    <RDOCode>${xmlEscape(data.rdoCode)}</RDOCode>
    <TaxPayerName>${xmlEscape(data.name)}</TaxPayerName>
    <Address>${xmlEscape(data.address || "")}</Address>
    <Year>${data.year}</Year>
    <FilingDate>${filingDate}</FilingDate>
    <TaxRateBasis>${xmlEscape(rateLabel)}</TaxRateBasis>
    <AnnualGrossIncome>${data.annualGrossIncome.toFixed(2)}</AnnualGrossIncome>
    <AnnualTaxableIncome>${data.annualTaxableIncome.toFixed(2)}</AnnualTaxableIncome>
    <AnnualTaxDue>${data.annualTaxDue.toFixed(2)}</AnnualTaxDue>
    <TotalAmountPayable>${data.annualTaxDue.toFixed(2)}</TotalAmountPayable>
  </Form1701>
</BIRForms>
`;
}

export function generateEBIR1701DAT(data: EBIR1701Data): string {
  const { digits: tin } = normalizeTin(data.tin);
  const filingDate = new Date().toISOString().slice(0, 10);
  const rateLabel = data.taxRate === 0.08 ? "8PCT" : "GRADUATED";

  return [
    FORM_VERSION,
    tin,
    data.rdoCode,
    data.name,
    data.address || "",
    String(data.year),
    filingDate,
    rateLabel,
    data.annualGrossIncome.toFixed(2),
    data.annualTaxableIncome.toFixed(2),
    data.annualTaxDue.toFixed(2),
    data.annualTaxDue.toFixed(2),
  ].join("|");
}
