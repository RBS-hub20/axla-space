import "server-only";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { logError } from "@/lib/log-error";

export interface ParsedTransaction {
  date: string; // YYYY-MM-DD
  description: string;
  amount: number; // always positive
  type: "income" | "expense";
}

export interface ParseResult {
  transactions: ParsedTransaction[];
  skippedRows: number;
  warning?: string;
}

/** Minimal CSV line splitter: handles quoted fields containing commas, doesn't need a library for GCash's simple export format. */
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

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

function findColumn(headers: string[], patterns: RegExp[]): number {
  for (const pattern of patterns) {
    const idx = headers.findIndex((h) => pattern.test(h));
    if (idx !== -1) return idx;
  }
  return -1;
}

function parseAmount(raw: string): number | null {
  const cleaned = raw.replace(/[₱PHP,\s]/gi, "").replace(/[()]/g, "-");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parses a date string to YYYY-MM-DD without ever routing it through a
 * timezone-sensitive `Date` constructor + `.toISOString()` — that pattern
 * silently shifts the date backward by a day for any host timezone ahead of
 * UTC (confirmed while testing: Asia/Manila turns "01/05/2026" into
 * "2026-01-04"). Vercel's functions happen to run in UTC today, which would
 * have masked this in production, but `npm run dev` on a PH machine — or
 * any future move off Vercel's default — would silently misfile
 * transactions into the wrong BIR quarter. ISO and slash/dash formats are
 * both handled by direct string parsing (zero timezone exposure); only the
 * last-resort fallback touches `Date`, and it forces UTC explicitly.
 */
function parseDate(raw: string): string | null {
  const trimmed = raw.trim();

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  // MM/DD/YYYY or DD/MM/YYYY — assume MM/DD/YYYY (GCash app default locale).
  const slashMatch = trimmed.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/);
  if (slashMatch) {
    const [, a, b, year] = slashMatch;
    return `${year}-${a.padStart(2, "0")}-${b.padStart(2, "0")}`;
  }

  // Last resort for unusual formats (e.g. "January 5, 2026") — force UTC
  // interpretation explicitly rather than letting the host's local timezone
  // silently shift the result.
  const forcedUtc = new Date(`${trimmed} UTC`);
  if (!Number.isNaN(forcedUtc.getTime())) {
    return forcedUtc.toISOString().slice(0, 10);
  }

  return null;
}

function keywordDirection(description: string): "income" | "expense" | null {
  const d = description.toLowerCase();
  if (/(received|padala received|cash ?in|deposit|refund|reload from bank|incoming)/.test(d)) return "income";
  if (/(sent|padala|cash ?out|bill(s)? payment|purchase|buy load|withdraw|payment to|expense|pay bill)/.test(d))
    return "expense";
  return null;
}

/**
 * AI fallback for rows whose direction can't be determined from columns or
 * keywords — batched (not per-row) to keep this cheap. Fails safe: rows the
 * model can't classify default to "expense" (the safer assumption for tax
 * purposes — better to undercount income than overstate it).
 */
async function classifyByDescriptionBatch(descriptions: string[]): Promise<Array<"income" | "expense">> {
  if (!process.env.OPENAI_API_KEY || descriptions.length === 0) {
    return descriptions.map(() => "expense");
  }

  try {
    const { object } = await generateObject({
      model: openai("gpt-4o-mini"),
      schema: z.object({
        classifications: z.array(z.enum(["income", "expense"])).describe("One classification per input description, same order"),
      }),
      messages: [
        {
          role: "user",
          content:
            "Classify each GCash transaction description below as 'income' (money received: padala, refunds, cash-in from a client) or 'expense' (money sent: bills, purchases, transfers out). Return exactly one classification per line, same order.\n\n" +
            descriptions.map((d, i) => `${i + 1}. ${d}`).join("\n"),
        },
      ],
    });
    if (object.classifications.length === descriptions.length) {
      return object.classifications;
    }
  } catch (err) {
    logError("classifyByDescriptionBatch: OpenAI call failed", err);
  }
  return descriptions.map(() => "expense");
}

/**
 * Parses a GCash transaction history CSV export. Column names vary between
 * export types, so this matches by common header patterns rather than
 * fixed positions: separate Debit/Credit columns, a single signed Amount
 * column, or a Type/Direction column are all handled; if none of those give
 * a clear answer, falls back to AI classification of the description text.
 *
 * GCash's in-app "Statement of Account" request delivers CSV, handled here.
 * PDF exports (often password-protected with LASTNAME + last 4 digits) go
 * through src/lib/gcash/unlock.ts for text extraction first, then
 * parseGcashPdfLines() below for the best-effort line-by-line parse.
 */
export async function parseGcashCsv(csvText: string): Promise<ParseResult> {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { transactions: [], skippedRows: 0, warning: "No data rows found in the file." };
  }

  const rawHeaders = splitCsvLine(lines[0]);
  const headers = rawHeaders.map(normalizeHeader);

  const dateIdx = findColumn(headers, [/^date/, /transactiondate/, /datetime/]);
  const descIdx = findColumn(headers, [/description/, /particular/, /remarks/, /transaction$/, /details/]);
  const debitIdx = findColumn(headers, [/debit/, /cashout/, /moneyout/]);
  const creditIdx = findColumn(headers, [/credit/, /cashin/, /moneyin/]);
  const amountIdx = findColumn(headers, [/^amount/, /value/]);
  const typeIdx = findColumn(headers, [/^type$/, /direction/, /transactiontype/]);

  if (dateIdx === -1 || descIdx === -1 || (debitIdx === -1 && creditIdx === -1 && amountIdx === -1)) {
    return {
      transactions: [],
      skippedRows: lines.length - 1,
      warning:
        "Couldn't find recognizable Date/Description/Amount columns. Expected a GCash transaction history CSV export.",
    };
  }

  const rows = lines.slice(1).map((line) => splitCsvLine(line));
  const results: Array<{ date: string; description: string; amount: number; type: "income" | "expense" | null }> = [];
  let skipped = 0;

  for (const cols of rows) {
    const date = parseDate(cols[dateIdx] ?? "");
    const description = (cols[descIdx] ?? "").trim() || "GCash transaction";
    if (!date) {
      skipped++;
      continue;
    }

    let amount: number | null = null;
    let type: "income" | "expense" | null = null;

    if (debitIdx !== -1 || creditIdx !== -1) {
      const debit = debitIdx !== -1 ? parseAmount(cols[debitIdx] ?? "") : null;
      const credit = creditIdx !== -1 ? parseAmount(cols[creditIdx] ?? "") : null;
      if (credit && credit > 0) {
        amount = credit;
        type = "income";
      } else if (debit && debit > 0) {
        amount = debit;
        type = "expense";
      }
    } else if (amountIdx !== -1) {
      const raw = parseAmount(cols[amountIdx] ?? "");
      if (raw !== null) {
        amount = Math.abs(raw);
        if (raw < 0) type = "expense";
        else if (raw > 0) {
          // Positive amount with no sign convention — check a type column, else keyword-match the description.
          const typeCol = typeIdx !== -1 ? (cols[typeIdx] ?? "").toLowerCase() : "";
          if (/in|credit|received/.test(typeCol)) type = "income";
          else if (/out|debit|sent/.test(typeCol)) type = "expense";
          else type = keywordDirection(description);
        }
      }
    }

    if (amount === null || amount === 0) {
      skipped++;
      continue;
    }

    results.push({ date, description, amount, type });
  }

  // Batch-classify anything still undetermined via AI, in groups of 25.
  const undetermined = results.filter((r) => r.type === null);
  if (undetermined.length > 0) {
    const BATCH = 25;
    for (let i = 0; i < undetermined.length; i += BATCH) {
      const batch = undetermined.slice(i, i + BATCH);
      const classifications = await classifyByDescriptionBatch(batch.map((r) => r.description));
      batch.forEach((r, j) => {
        r.type = classifications[j];
      });
    }
  }

  const transactions: ParsedTransaction[] = results.map((r) => ({
    date: r.date,
    description: r.description,
    amount: r.amount,
    type: r.type ?? "expense",
  }));

  return { transactions, skippedRows: skipped };
}

const PDF_LINE_DATE_RE = /^(\d{4}-\d{2}-\d{2}|\d{1,2}[/\-]\d{1,2}[/\-]\d{4})/;
const PDF_LINE_AMOUNT_RE = /([₱P]?\s?\(?-?[\d,]+\.\d{2}\)?)\s*$/i;

/**
 * Best-effort parse of text lines reconstructed from a GCash statement PDF
 * (see src/lib/gcash/unlock.ts) — matches a date at the start of a line and
 * an amount at the end, treating whatever's between as the description.
 * This is inherently less reliable than the CSV path above: GCash's PDF
 * statement layout isn't a real table once flattened to text, and this
 * hasn't been tuned against an actual GCash-exported PDF sample. Lines that
 * don't match both a leading date and a trailing amount are silently
 * skipped rather than guessed at.
 */
export async function parseGcashPdfLines(lines: string[]): Promise<ParseResult> {
  const results: Array<{ date: string; description: string; amount: number; type: "income" | "expense" | null }> = [];
  let skipped = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const dateMatch = line.match(PDF_LINE_DATE_RE);
    const amountMatch = line.match(PDF_LINE_AMOUNT_RE);
    if (!dateMatch || !amountMatch) {
      skipped++;
      continue;
    }

    const date = parseDate(dateMatch[1]);
    const rawAmount = parseAmount(amountMatch[1]);
    if (!date || rawAmount === null || rawAmount === 0) {
      skipped++;
      continue;
    }

    const description = line.slice(dateMatch[0].length, line.length - amountMatch[0].length).trim() || "GCash transaction";
    const amount = Math.abs(rawAmount);
    const type: "income" | "expense" | null = rawAmount < 0 ? "expense" : rawAmount > 0 ? keywordDirection(description) : null;

    results.push({ date, description, amount, type });
  }

  if (results.length === 0) {
    return {
      transactions: [],
      skippedRows: skipped,
      warning:
        "Couldn't find recognizable transaction lines in this PDF. GCash PDF layouts vary — the CSV export from the GCash app is more reliable.",
    };
  }

  const undetermined = results.filter((r) => r.type === null);
  if (undetermined.length > 0) {
    const BATCH = 25;
    for (let i = 0; i < undetermined.length; i += BATCH) {
      const batch = undetermined.slice(i, i + BATCH);
      const classifications = await classifyByDescriptionBatch(batch.map((r) => r.description));
      batch.forEach((r, j) => {
        r.type = classifications[j];
      });
    }
  }

  const transactions: ParsedTransaction[] = results.map((r) => ({
    date: r.date,
    description: r.description,
    amount: r.amount,
    type: r.type ?? "expense",
  }));

  return { transactions, skippedRows: skipped };
}
