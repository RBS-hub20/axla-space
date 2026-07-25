import "server-only";
import { generateObject } from "ai";
import { openai } from "@ai-sdk/openai";
import { z } from "zod";
import { logError } from "@/lib/log-error";
import type { ParsedTransaction, ParseResult } from "@/lib/dashboard/gcash-parser";

/**
 * Parses a Maya (formerly PayMaya) wallet/business transaction CSV export.
 * Same column-detection + AI-fallback approach as the GCash parser
 * (src/lib/dashboard/gcash-parser.ts) — Maya's own export header set is
 * simpler and more consistent ("Date", "Transaction ID", "Type", "Amount",
 * "Balance"), but this still matches by pattern rather than fixed position
 * since Maya has changed its export column set before.
 */

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

/** Same UTC-forced date parsing as gcash-parser.ts's parseDate() — never routes through a timezone-sensitive Date().toISOString() for slash/dash/ISO formats. */
function parseDate(raw: string): string | null {
  const trimmed = raw.trim();

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

/** Maya's "Type" column values map fairly directly to a direction — "Transfer" rows are ambiguous (could be either way) so those fall through to keyword/AI classification. */
function typeColumnDirection(typeValue: string): "income" | "expense" | null {
  const t = typeValue.toLowerCase();
  if (/(cash ?in|received|deposit|incoming|credit|refund|payment received)/.test(t)) return "income";
  if (/(cash ?out|sent|withdraw|debit|outgoing|bill(s)? pay|purchase|send money|payment)/.test(t)) return "expense";
  return null;
}

function keywordDirection(description: string): "income" | "expense" | null {
  const d = description.toLowerCase();
  if (/(received|incoming|cash ?in|deposit|refund|payment from)/.test(d)) return "income";
  if (/(sent|cash ?out|withdraw|bill(s)? payment|purchase|send money|payment to|expense)/.test(d)) return "expense";
  return null;
}

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
            "Classify each Maya wallet transaction description below as 'income' (money received: transfers in, refunds, payments from clients) or 'expense' (money sent: bills, purchases, transfers out). Return exactly one classification per line, same order.\n\n" +
            descriptions.map((d, i) => `${i + 1}. ${d}`).join("\n"),
        },
      ],
    });
    if (object.classifications.length === descriptions.length) return object.classifications;
  } catch (err) {
    logError("maya parser classifyByDescriptionBatch: OpenAI call failed", err);
  }
  return descriptions.map(() => "expense");
}

/**
 * Parses a Maya wallet/business transaction history CSV export. Expected
 * headers: Date, Transaction ID, Type, Amount, Balance — but matched by
 * pattern (not position) the same way the GCash parser is, since Maya's
 * business-account export adds extra columns (Reference No., Remarks) that
 * the personal wallet export doesn't have.
 */
export async function parseMayaCsv(csvText: string): Promise<ParseResult> {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    return { transactions: [], skippedRows: 0, warning: "No data rows found in the file." };
  }

  const rawHeaders = splitCsvLine(lines[0]);
  const headers = rawHeaders.map(normalizeHeader);

  const dateIdx = findColumn(headers, [/^date/, /transactiondate/, /datetime/]);
  const descIdx = findColumn(headers, [/description/, /remarks/, /particular/, /transaction$/, /details/, /transactionid/]);
  const amountIdx = findColumn(headers, [/^amount/, /value/]);
  const debitIdx = findColumn(headers, [/debit/, /cashout/, /moneyout/]);
  const creditIdx = findColumn(headers, [/credit/, /cashin/, /moneyin/]);
  const typeIdx = findColumn(headers, [/^type$/, /transactiontype/, /direction/]);

  if (dateIdx === -1 || (debitIdx === -1 && creditIdx === -1 && amountIdx === -1)) {
    return {
      transactions: [],
      skippedRows: lines.length - 1,
      warning: "Couldn't find recognizable Date/Amount columns. Expected a Maya wallet transaction history CSV export.",
    };
  }

  const rows = lines.slice(1).map((line) => splitCsvLine(line));
  const results: Array<{ date: string; description: string; amount: number; type: "income" | "expense" | null }> = [];
  let skipped = 0;

  for (const cols of rows) {
    const date = parseDate(cols[dateIdx] ?? "");
    const description = (descIdx !== -1 ? (cols[descIdx] ?? "").trim() : "") || "Maya transaction";
    if (!date) {
      skipped++;
      continue;
    }

    let amount: number | null = null;
    let type: "income" | "expense" | null = null;
    const typeVal = typeIdx !== -1 ? (cols[typeIdx] ?? "") : "";

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
          type = (typeVal && typeColumnDirection(typeVal)) || keywordDirection(description);
        }
      }
    }

    if (amount === null || amount === 0) {
      skipped++;
      continue;
    }

    if (type === null && typeVal) type = typeColumnDirection(typeVal);
    results.push({ date, description, amount, type });
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
