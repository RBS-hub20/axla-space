import { toCsv } from "@/lib/export/csv-utils";

export interface SheetsExportTransaction {
  transaction_date: string;
  description: string;
  amount: number;
  type: "income" | "expense";
  source?: string | null;
  quarter?: number | null;
  year?: number | null;
}

const SOURCE_LABELS: Record<string, string> = {
  gcash_upload: "GCash",
  maya_upload: "Maya",
  bank_upload: "Bank",
};

/** A "full detail" CSV for Google Sheets / manual bookkeeping — every column Axla tracks per transaction, not just the minimal set the accounting-software exports need. */
export function generateSheetsCsv(transactions: SheetsExportTransaction[]): string {
  const rows: (string | number)[][] = [
    ["Date", "Description", "Amount", "Type", "Category", "Source", "Quarter", "Year"],
  ];
  for (const t of transactions) {
    const category = t.type === "income" ? "Income" : "Expense";
    const source = (t.source && SOURCE_LABELS[t.source]) || "Manual";
    rows.push([
      t.transaction_date,
      t.description,
      t.amount.toFixed(2),
      t.type,
      category,
      source,
      t.quarter ?? "",
      t.year ?? "",
    ]);
  }
  return toCsv(rows);
}
