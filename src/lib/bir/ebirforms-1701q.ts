/**
 * IMPORTANT — read before trusting the "importable" framing anywhere this
 * is used. Same caveat as src/lib/bir/ebirforms-2551q.ts: BIR's real
 * Offline eBIRForms app has no documented "File → Import" for externally
 * generated XML/DAT, so this is NOT guaranteed to open or auto-fill inside
 * the real eBIRForms app.
 *
 * What this genuinely is: a portable, structured export of the 1701Q
 * figures Axla already computed (or the user entered) — a backup, a
 * handoff to an accountant, or a faster re-type into the real eBIRForms
 * app. This is a first-pass field mapping, not a full 1701Q (it doesn't
 * model itemized deductions, multiple income sources, or prior-quarter
 * carryover schedules) — always re-verify in eBIRForms before submitting.
 */

import { normalizeTin } from "@/lib/bir/ebirforms-2551q";

export interface EBIR1701QData {
  tin: string;
  rdoCode: string;
  name: string;
  address?: string;
  quarter: number;
  year: number;
  taxableIncome: number;
  taxDue: number;
  taxRate?: 0.08 | "graduated";
}

const FORM_VERSION = "1701Qv2018";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateEBIR1701QXML(data: EBIR1701QData): string {
  const { digits: tin } = normalizeTin(data.tin);
  const filingDate = new Date().toISOString().slice(0, 10);
  const rateLabel = data.taxRate === 0.08 ? "8% Flat Rate" : "Graduated Rates";

  return `<?xml version="1.0" encoding="UTF-8"?>
<BIRForms>
  <Form1701Q version="${FORM_VERSION}">
    <TIN>${tin}</TIN>
    <RDOCode>${xmlEscape(data.rdoCode)}</RDOCode>
    <TaxPayerName>${xmlEscape(data.name)}</TaxPayerName>
    <Address>${xmlEscape(data.address || "")}</Address>
    <Quarter>${data.quarter}</Quarter>
    <Year>${data.year}</Year>
    <FilingDate>${filingDate}</FilingDate>
    <TaxRateBasis>${xmlEscape(rateLabel)}</TaxRateBasis>
    <TaxableIncome>${data.taxableIncome.toFixed(2)}</TaxableIncome>
    <TaxDue>${data.taxDue.toFixed(2)}</TaxDue>
    <TotalAmountPayable>${data.taxDue.toFixed(2)}</TotalAmountPayable>
  </Form1701Q>
</BIRForms>
`;
}

export function generateEBIR1701QDAT(data: EBIR1701QData): string {
  const { digits: tin } = normalizeTin(data.tin);
  const filingDate = new Date().toISOString().slice(0, 10);
  const rateLabel = data.taxRate === 0.08 ? "8PCT" : "GRADUATED";

  return [
    FORM_VERSION,
    tin,
    data.rdoCode,
    data.name,
    data.address || "",
    String(data.quarter),
    String(data.year),
    filingDate,
    rateLabel,
    data.taxableIncome.toFixed(2),
    data.taxDue.toFixed(2),
    data.taxDue.toFixed(2),
  ].join("|");
}
