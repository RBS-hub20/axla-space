// No "server-only" guard here (unlike the ebirforms-*.ts files' data
// lookups) — this module is pure string formatting with no secrets or DB
// access, and DownloadBirFiles.tsx (a client component) calls it directly
// to generate downloads without a server round-trip.
export type BirFormType = "2551Q" | "1701Q" | "1701" | "0619E" | "2307";

/**
 * Axla's own structured pipe-delimited reference format (H = header record,
 * D = detail/line record, F = footer/total record). This is a readable,
 * portable serialization Axla designed for its own DAT exports — it is NOT
 * a BIR-published file spec, and there is no confirmed "v7.9.4.2 IAF"
 * format or eBIRForms import feature to model it after (checked BIR's own
 * job-aid PDF and third-party filing-software write-ups; none document a
 * generic third-party file-import path for eBIRForms desktop). Every
 * ebirforms-*.ts generator in this codebase carries the same caveat: these
 * are structured references for backup / accountant handoff / faster
 * re-typing into the real eBIRForms app, always re-verified there before
 * submitting — never a claimed direct-import file.
 */
export interface IafHeaderFields {
  formType: BirFormType;
  tin: string;
  rdo: string;
  taxpayerName: string;
  period: string; // e.g. "Q2", "M07", "ANNUAL"
  year: number;
  filingDate: string; // YYYYMMDD
}

export interface IafDetailLine {
  label: string;
  value: string;
}

export interface IafFooterFields {
  lineCount: number;
  totalGross: number;
  totalTaxDue: number;
}

/** Axla's own reference-format version tag — deliberately not a BIR/eBIRForms version string, since compatibility with any specific eBIRForms release has never been verified. */
export const AXLA_REF_FORMAT_VERSION = "AXLA-REF-1.0";

export function formatIAF(header: IafHeaderFields, details: IafDetailLine[], footer: IafFooterFields): string {
  const lines: string[] = [
    "# Axla BIR-Ready Reference — structured export for backup, accountant handoff, or faster re-typing into the real eBIRForms app. NOT a verified eBIRForms import file — always re-verify these figures there before submitting.",
    [
      `H${header.formType}`,
      header.tin,
      header.rdo,
      header.taxpayerName,
      header.period,
      String(header.year),
      header.filingDate,
      AXLA_REF_FORMAT_VERSION,
    ].join("|"),
  ];

  details.forEach((d, i) => {
    lines.push(["D", String(i + 1).padStart(3, "0"), d.label, d.value].join("|"));
  });

  lines.push(["F", String(footer.lineCount), footer.totalGross.toFixed(2), footer.totalTaxDue.toFixed(2)].join("|"));

  return lines.join("\n") + "\n";
}

/** e.g. generateFileName("2551Q", "Q2", 2026) -> "2551Q_Q2_2026_Axla.dat" */
export function generateFileName(formType: BirFormType, period: string, year: number): string {
  return `${formType}_${period}_${year}_Axla.dat`;
}
