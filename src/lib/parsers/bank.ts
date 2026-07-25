import "server-only";
import * as XLSX from "xlsx";
import { logError } from "@/lib/log-error";
import type { ParsedTransaction, ParseResult } from "@/lib/dashboard/gcash-parser";

/**
 * Generic parser for Philippine bank CSV/XLSX statement exports (BPI, BDO,
 * UnionBank, and similar). Unlike the GCash/Maya parsers, banks don't share
 * one export format at all — this matches by header *synonym* across the
 * three most common column-naming conventions banks use:
 *   - Date: "Transaction Date" / "Value Date" / "Date" / "Posting Date"
 *   - Description: "Description" / "Particulars" / "Details" / "Narrative"
 *   - Amount: either a single signed "Amount" column, or split
 *     "Debit"/"Credit" (sometimes "Withdrawal"/"Deposit") columns
 *   - Balance: "Balance" / "Running Balance" (not required, just skipped)
 */

function normalizeHeader(h: string): string {
  return String(h).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findColumn(headers: string[], patterns: RegExp[]): number {
  for (const pattern of patterns) {
    const idx = headers.findIndex((h) => pattern.test(h));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseAmount(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  const cleaned = String(raw ?? "")
    .replace(/[₱PHP,\s]/gi, "")
    .replace(/^\((.*)\)$/, "-$1");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Same UTC-forced parsing convention as gcash-parser.ts's parseDate() — plus a numeric-serial branch for XLSX date cells, which arrive as Excel serial numbers rather than strings. */
function parseDate(raw: unknown): string | null {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    // Excel serial date (days since 1899-12-30) — xlsx's own date math, forced UTC.
    const epoch = Date.UTC(1899, 11, 30);
    const ms = epoch + raw * 86_400_000;
    const d = new Date(ms);
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
  }

  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const slashMatch = trimmed.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/);
  if (slashMatch) {
    const [, a, b, year] = slashMatch;
    return `${year}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`;
  }

  const forcedUtc = new Date(`${trimmed} UTC`);
  if (!Number.isNaN(forcedUtc.getTime())) return forcedUtc.toISOString().slice(0, 10);

  return null;
}

/** Shared row-processing core — operates on already-tabular rows (string[][]) regardless of whether they came from CSV text or an XLSX sheet. */
async function parseRows(rawHeaders: string[], rows: unknown[][]): Promise<ParseResult> {
  const headers = rawHeaders.map(normalizeHeader);

  const dateIdx = findColumn(headers, [/transactiondate/, /valuedate/, /postingdate/, /^date/]);
  const descIdx = findColumn(headers, [/description/, /particular/, /narrative/, /details/, /remarks/]);
  const debitIdx = findColumn(headers, [/debit/, /withdrawal/, /moneyout/]);
  const creditIdx = findColumn(headers, [/credit/, /deposit/, /moneyin/]);
  const amountIdx = findColumn(headers, [/^amount/, /value/]);

  if (dateIdx === -1 || (debitIdx === -1 && creditIdx === -1 && amountIdx === -1)) {
    return {
      transactions: [],
      skippedRows: rows.length,
      warning:
        "Couldn't find recognizable Date/Amount columns. Expected a bank statement export with Transaction Date, Description/Particulars, and Amount or Debit/Credit columns.",
    };
  }

  const results: Array<{ date: string; description: string; amount: number; type: "income" | "expense" }> = [];
  let skipped = 0;

  for (const cols of rows) {
    const date = parseDate(cols[dateIdx]);
    const description = (descIdx !== -1 ? String(cols[descIdx] ?? "").trim() : "") || "Bank transaction";
    if (!date) {
      skipped++;
      continue;
    }

    let amount: number | null = null;
    let type: "income" | "expense" | null = null;

    if (debitIdx !== -1 || creditIdx !== -1) {
      const debit = debitIdx !== -1 ? parseAmount(cols[debitIdx]) : null;
      const credit = creditIdx !== -1 ? parseAmount(cols[creditIdx]) : null;
      if (credit && credit > 0) {
        amount = credit;
        type = "income";
      } else if (debit && debit > 0) {
        amount = debit;
        type = "expense";
      }
    } else if (amountIdx !== -1) {
      // A single Amount column on a bank statement is a signed value by
      // standard convention (negative = debit/withdrawal, positive =
      // credit/deposit) — unlike GCash's export, where positive amounts are
      // ambiguous and need keyword/AI classification (see gcash-parser.ts).
      // The sign here is authoritative; no keyword fallback needed for
      // nonzero values.
      const raw = parseAmount(cols[amountIdx]);
      if (raw !== null) {
        amount = Math.abs(raw);
        if (raw < 0) type = "expense";
        else if (raw > 0) type = "income";
      }
    }

    if (amount === null || amount === 0 || type === null) {
      skipped++;
      continue;
    }

    results.push({ date, description, amount, type });
  }

  const transactions: ParsedTransaction[] = results.map((r) => ({
    date: r.date,
    description: r.description,
    amount: r.amount,
    type: r.type ?? "expense",
  }));

  return { transactions, skippedRows: skipped };
}

/** Minimal CSV line splitter — handles quoted fields containing commas, same approach as the GCash/Maya parsers. */
function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current.trim());
  return fields;
}

/** Parses a bank statement CSV export (BPI, BDO, UnionBank, or similar — header synonyms, not a fixed layout). */
export async function parseBankCsv(csvText: string): Promise<ParseResult> {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { transactions: [], skippedRows: 0, warning: "No data rows found in the file." };
  }
  const rawHeaders = splitCsvLine(lines[0]);
  const rows = lines.slice(1).map((line) => splitCsvLine(line));
  return parseRows(rawHeaders, rows);
}

/**
 * Parses a bank statement XLSX export. Reads the first sheet, treats row 1
 * as headers — banks that export XLSX (UnionBank's online banking export,
 * for instance) put the transaction table on the first sheet starting at
 * row 1, with no merged-header preamble.
 */
export async function parseBankXlsx(bytes: Uint8Array): Promise<ParseResult> {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(bytes, { type: "array", cellDates: false });
  } catch (err) {
    logError("bank parser: XLSX.read failed", err);
    return { transactions: [], skippedRows: 0, warning: "Couldn't read this XLSX file — it may be corrupted or password-protected." };
  }

  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { transactions: [], skippedRows: 0, warning: "This XLSX file has no sheets." };
  }
  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: "" });

  if (rows.length < 2) {
    return { transactions: [], skippedRows: 0, warning: "No data rows found in this sheet." };
  }

  const rawHeaders = (rows[0] as unknown[]).map((h) => String(h));
  return parseRows(rawHeaders, rows.slice(1));
}
