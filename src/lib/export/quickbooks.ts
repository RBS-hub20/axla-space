import { toCsv } from "@/lib/export/csv-utils";

export interface ExportTransaction {
  transaction_date: string;
  description: string;
  amount: number;
  type: "income" | "expense";
}

/**
 * QuickBooks-compatible CSV — matches the 3-column "Banking CSV" layout
 * QuickBooks Online's bank-feed CSV import expects (Date, Description,
 * Amount), plus an Account column mapped from income/expense since this
 * app doesn't track a full chart of accounts. Amount is signed (positive
 * for income, negative for expense) per QuickBooks' own import convention.
 */
export function generateQuickBooksCsv(transactions: ExportTransaction[]): string {
  const rows: (string | number)[][] = [["Date", "Description", "Amount", "Account"]];
  for (const t of transactions) {
    const signedAmount = t.type === "income" ? t.amount : -t.amount;
    const account = t.type === "income" ? "Income:Sales" : "Expenses:Business";
    rows.push([t.transaction_date, t.description, signedAmount.toFixed(2), account]);
  }
  return toCsv(rows);
}
