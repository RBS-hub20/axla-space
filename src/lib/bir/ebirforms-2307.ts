/**
 * IMPORTANT — same caveat as the other ebirforms-*.ts generators: BIR's
 * real Offline eBIRForms app has no documented generic file-import
 * feature, so this export is NOT guaranteed to open or auto-fill inside
 * the real eBIRForms app.
 *
 * 2307 is the Certificate of Creditable Tax Withheld at Source — issued BY
 * a withholding agent (a client) TO a payee (the freelancer), certifying
 * how much was withheld from a payment. Most Axla users receive these
 * (as proof to attach when filing their own return), rather than issue
 * them — this generator supports both directions since either the payer
 * or the payee may want a record. First-pass field mapping — always
 * re-verify in eBIRForms/the real certificate before relying on it.
 */

import { normalizeTin } from "@/lib/bir/ebirforms-2551q";

export interface EBIR2307Data {
  payorTin: string;
  payorName: string;
  payeeTin: string;
  payeeName: string;
  rdoCode: string;
  quarter: number;
  year: number;
  incomePayment: number;
  taxWithheld: number;
  atc?: string;
}

export const DEFAULT_2307_ATC = "WC160";
const FORM_VERSION = "2307v2018";

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function generateEBIR2307XML(data: EBIR2307Data): string {
  const { digits: payorTin } = normalizeTin(data.payorTin);
  const { digits: payeeTin } = normalizeTin(data.payeeTin);
  const atc = data.atc || DEFAULT_2307_ATC;
  const filingDate = new Date().toISOString().slice(0, 10);

  return `<?xml version="1.0" encoding="UTF-8"?>
<BIRForms>
  <Form2307 version="${FORM_VERSION}">
    <PayorTIN>${payorTin}</PayorTIN>
    <PayorName>${xmlEscape(data.payorName)}</PayorName>
    <PayeeTIN>${payeeTin}</PayeeTIN>
    <PayeeName>${xmlEscape(data.payeeName)}</PayeeName>
    <RDOCode>${xmlEscape(data.rdoCode)}</RDOCode>
    <Quarter>${data.quarter}</Quarter>
    <Year>${data.year}</Year>
    <IssueDate>${filingDate}</IssueDate>
    <ATC>${xmlEscape(atc)}</ATC>
    <IncomePayment>${data.incomePayment.toFixed(2)}</IncomePayment>
    <TaxWithheld>${data.taxWithheld.toFixed(2)}</TaxWithheld>
  </Form2307>
</BIRForms>
`;
}

export function generateEBIR2307DAT(data: EBIR2307Data): string {
  const { digits: payorTin } = normalizeTin(data.payorTin);
  const { digits: payeeTin } = normalizeTin(data.payeeTin);
  const atc = data.atc || DEFAULT_2307_ATC;
  const filingDate = new Date().toISOString().slice(0, 10);

  return [
    FORM_VERSION,
    payorTin,
    data.payorName,
    payeeTin,
    data.payeeName,
    data.rdoCode,
    String(data.quarter),
    String(data.year),
    filingDate,
    atc,
    data.incomePayment.toFixed(2),
    data.taxWithheld.toFixed(2),
  ].join("|");
}
