/**
 * IMPORTANT — same caveat as the other ebirforms-*.ts generators: BIR's
 * real Offline eBIRForms app has no documented generic file-import
 * feature, so this export is NOT guaranteed to open or auto-fill inside
 * the real eBIRForms app.
 *
 * 0619E is the Monthly Remittance Return of Creditable Income Taxes
 * Withheld (Expanded) — filed by a withholding agent (a business paying
 * a freelancer/supplier) to remit tax withheld FROM that payment, not tax
 * the freelancer owes on their own income. Most Axla users are payees,
 * not withholding agents, so this only applies if the user also runs a
 * business that withholds tax on payments to others. This is a first-pass
 * field mapping — always re-verify in eBIRForms before submitting.
 */

import { normalizeTin } from "@/lib/bir/ebirforms-2551q";

export interface EBIR0619EData {
  tin: string;
  rdoCode: string;
  name: string;
  address?: string;
  month: number; // 1-12
  year: number;
  totalIncomePayments: number;
  taxWithheld: number;
  atc?: string;
}

export const DEFAULT_0619E_ATC = "WC160";
const FORM_VERSION = "0619Ev2018";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateEBIR0619EXML(data: EBIR0619EData): string {
  const { digits: tin } = normalizeTin(data.tin);
  const atc = data.atc || DEFAULT_0619E_ATC;
  const filingDate = new Date().toISOString().slice(0, 10);

  return `<?xml version="1.0" encoding="UTF-8"?>
<BIRForms>
  <Form0619E version="${FORM_VERSION}">
    <TIN>${tin}</TIN>
    <RDOCode>${xmlEscape(data.rdoCode)}</RDOCode>
    <WithholdingAgentName>${xmlEscape(data.name)}</WithholdingAgentName>
    <Address>${xmlEscape(data.address || "")}</Address>
    <Month>${data.month}</Month>
    <Year>${data.year}</Year>
    <FilingDate>${filingDate}</FilingDate>
    <ATC>${xmlEscape(atc)}</ATC>
    <TotalIncomePayments>${data.totalIncomePayments.toFixed(2)}</TotalIncomePayments>
    <TaxWithheld>${data.taxWithheld.toFixed(2)}</TaxWithheld>
    <TotalAmountPayable>${data.taxWithheld.toFixed(2)}</TotalAmountPayable>
  </Form0619E>
</BIRForms>
`;
}

export function generateEBIR0619EDAT(data: EBIR0619EData): string {
  const { digits: tin } = normalizeTin(data.tin);
  const atc = data.atc || DEFAULT_0619E_ATC;
  const filingDate = new Date().toISOString().slice(0, 10);

  return [
    FORM_VERSION,
    tin,
    data.rdoCode,
    data.name,
    data.address || "",
    String(data.month),
    String(data.year),
    filingDate,
    atc,
    data.totalIncomePayments.toFixed(2),
    data.taxWithheld.toFixed(2),
    data.taxWithheld.toFixed(2),
  ].join("|");
}
