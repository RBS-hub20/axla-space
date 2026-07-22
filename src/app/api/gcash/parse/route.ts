import { NextResponse } from "next/server";
import Papa from "papaparse";
import { tryUnlockGCash, GCashPasswordRequiredError, GCashPasswordIncorrectError } from "@/lib/gcash/unlock";

export interface ParsedGCashTransaction {
  date: string;
  desc: string;
  amount: number;
  type: "income" | "expense";
}

interface DetectedColumns {
  dateKey: string;
  descKey: string;
  amountKey: string | null;
  creditKey: string | null;
  debitKey: string | null;
}

function findHeader(keys: string[], candidates: string[]): string | undefined {
  return keys.find((k) => candidates.includes(k.toLowerCase().trim()));
}

/** Supports a plain signed Amount column, or GCash-style split Credit/Debit (money in/out) columns. */
function detectColumns(row: Record<string, string>): DetectedColumns | null {
  const keys = Object.keys(row);
  const dateKey = findHeader(keys, ["date", "transaction date", "txn date", "date & time"]);
  const descKey = findHeader(keys, ["description", "desc", "details", "particulars", "remarks", "note"]);
  const amountKey = findHeader(keys, ["amount", "amount (php)", "value"]) ?? null;
  const creditKey = findHeader(keys, ["credit", "money in", "cash in", "received"]) ?? null;
  const debitKey = findHeader(keys, ["debit", "money out", "cash out", "sent"]) ?? null;

  if (!dateKey) return null;
  if (!amountKey && !creditKey && !debitKey) return null;

  return { dateKey, descKey: descKey ?? "", amountKey, creditKey, debitKey };
}

/** Handles ₱ symbols, thousands separators, and accounting-style negatives like "(1,200.00)". */
function parseAmount(raw: string): number {
  const cleaned = String(raw ?? "").replace(/[₱,\s]/g, "").trim();
  if (!cleaned) return 0;
  const isParenNegative = /^\(.*\)$/.test(cleaned);
  const num = Number(cleaned.replace(/[()]/g, ""));
  if (!Number.isFinite(num)) return NaN;
  return isParenNegative ? -Math.abs(num) : num;
}

/**
 * Lightweight, AI-free extraction for PDF lines — this endpoint is meant to
 * stay a fast, dependency-light utility (unlike the real dashboard upload
 * pipeline in /api/dashboard/transactions, which falls back to AI
 * classification for ambiguous rows). A line with no clear sign or keyword
 * defaults to "expense", the safer assumption for tax purposes.
 */
function directionFromKeyword(description: string): "income" | "expense" {
  const d = description.toLowerCase();
  if (/(received|cash ?in|deposit|refund|incoming)/.test(d)) return "income";
  return "expense";
}

const PDF_LINE_DATE_RE = /^(\d{4}-\d{2}-\d{2}|\d{1,2}[/\-]\d{1,2}[/\-]\d{4})/;
const PDF_LINE_AMOUNT_RE = /([₱P]?\s?\(?-?[\d,]+\.\d{2}\)?)\s*$/i;

function parsePdfLines(lines: string[]): ParsedGCashTransaction[] {
  const transactions: ParsedGCashTransaction[] = [];

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const dateMatch = line.match(PDF_LINE_DATE_RE);
    const amountMatch = line.match(PDF_LINE_AMOUNT_RE);
    if (!dateMatch || !amountMatch) continue;

    const rawAmount = parseAmount(amountMatch[1]);
    if (!Number.isFinite(rawAmount) || rawAmount === 0) continue;

    const desc = line.slice(dateMatch[0].length, line.length - amountMatch[0].length).trim() || "—";
    const type: "income" | "expense" = rawAmount < 0 ? "expense" : rawAmount > 0 ? directionFromKeyword(desc) : "expense";

    transactions.push({ date: dateMatch[1], desc, amount: Math.abs(rawAmount), type });
  }

  return transactions;
}

export async function POST(req: Request) {
  let csvText = "";

  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const passwordRaw = form.get("password");
      const password = typeof passwordRaw === "string" && passwordRaw ? passwordRaw : undefined;

      if (!(file instanceof File)) {
        return NextResponse.json({ error: "No file provided." }, { status: 400 });
      }

      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      if (isPdf) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        let lines: string[];
        try {
          lines = await tryUnlockGCash(bytes, password);
        } catch (err) {
          if (err instanceof GCashPasswordRequiredError || err instanceof GCashPasswordIncorrectError) {
            return NextResponse.json({ error: err.message, isProtected: true }, { status: 422 });
          }
          return NextResponse.json({ error: "Couldn't read this PDF. Try the CSV export instead." }, { status: 400 });
        }

        const transactions = parsePdfLines(lines);
        if (transactions.length === 0) {
          return NextResponse.json(
            { error: "Couldn't find recognizable transaction lines in this PDF." },
            { status: 400 },
          );
        }
        const totalIncome = transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
        const totalExpenses = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
        return NextResponse.json({
          totalIncome,
          totalExpenses,
          net: totalIncome - totalExpenses,
          transactions,
          count: transactions.length,
        });
      }

      csvText = await file.text();
    } else {
      const body = await req.json().catch(() => null);
      csvText = typeof body?.csvText === "string" ? body.csvText : "";
      if (!csvText) {
        return NextResponse.json({ error: "No CSV text provided." }, { status: 400 });
      }
    }
  } catch {
    return NextResponse.json({ error: "Failed to read request body." }, { status: 400 });
  }

  const parsed = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const rows = (parsed.data ?? []).filter((row) => Object.values(row).some((v) => String(v ?? "").trim() !== ""));
  if (rows.length === 0) {
    return NextResponse.json({ error: "No transaction rows found in this CSV." }, { status: 400 });
  }

  const columns = detectColumns(rows[0]);
  if (!columns) {
    return NextResponse.json(
      {
        error:
          "Couldn't find recognizable columns. Expected a Date column plus either an Amount column, or Credit/Debit columns.",
      },
      { status: 400 },
    );
  }

  const transactions: ParsedGCashTransaction[] = [];
  let totalIncome = 0;
  let totalExpenses = 0;

  for (const row of rows) {
    let amount: number;

    if (columns.amountKey) {
      amount = parseAmount(row[columns.amountKey]);
    } else {
      const credit = columns.creditKey ? parseAmount(row[columns.creditKey]) || 0 : 0;
      const debit = columns.debitKey ? parseAmount(row[columns.debitKey]) || 0 : 0;
      amount = credit - Math.abs(debit);
    }

    if (!Number.isFinite(amount) || amount === 0) continue;

    const type: "income" | "expense" = amount > 0 ? "income" : "expense";
    const absAmount = Math.abs(amount);

    if (type === "income") totalIncome += absAmount;
    else totalExpenses += absAmount;

    transactions.push({
      date: String(row[columns.dateKey] ?? "").trim(),
      desc: String(row[columns.descKey] ?? "").trim() || "—",
      amount: absAmount,
      type,
    });
  }

  if (transactions.length === 0) {
    return NextResponse.json(
      { error: "Found rows but couldn't extract any valid amounts from them." },
      { status: 400 },
    );
  }

  return NextResponse.json({
    totalIncome,
    totalExpenses,
    net: totalIncome - totalExpenses,
    transactions,
    count: transactions.length,
  });
}
