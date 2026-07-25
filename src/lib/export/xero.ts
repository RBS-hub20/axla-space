import { toCsv } from "@/lib/export/csv-utils";
import type { ExportTransaction } from "@/lib/export/quickbooks";

/**
 * Xero-compatible bank statement CSV — matches Xero's documented manual
 * bank-statement import columns (Date, Amount, Payee, Description,
 * Reference). Amount is signed (positive for income/money-in, negative
 * for expense/money-out), which is how Xero's own bank CSV import expects
 * it. "Payee" isn't tracked separately in Axla's transaction records, so
 * it falls back to the transaction description.
 */
export function generateXeroCsv(transactions: ExportTransaction[]): string {
  const rows: (string | number)[][] = [["Date", "Amount", "Payee", "Description", "Reference"]];
  for (const t of transactions) {
    const signedAmount = t.type === "income" ? t.amount : -t.amount;
    rows.push([t.transaction_date, signedAmount.toFixed(2), t.description, t.description, ""]);
  }
  return toCsv(rows);
}
