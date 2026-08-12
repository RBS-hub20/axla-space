"use client";

import ExcelJS from "exceljs";
import type { PayrollBreakdownRow } from "@/lib/payroll/sahod";

/** Client-side only, same "dynamic import, no server round-trip, immediate browser download" pattern as generatePayslipPdf. */
export async function exportPayrollRunExcel(
  run: { month: string; cut_off?: string | null },
  rows: PayrollBreakdownRow[],
  gcashFor: (staffId: string) => string | null,
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Payroll Run");

  sheet.columns = [
    { header: "Staff", key: "name", width: 24 },
    { header: "Days Present", key: "days", width: 13 },
    { header: "Basic Pay", key: "basic", width: 13 },
    { header: "Late/Undertime Deduction", key: "lateUt", width: 24 },
    { header: "Overtime Pay", key: "ot", width: 14 },
    { header: "Commission", key: "commission", width: 13 },
    { header: "Advances Deduction", key: "advances", width: 19 },
    { header: "Gross Pay", key: "gross", width: 13 },
    { header: "Net Pay", key: "net", width: 13 },
    { header: "GCash Number", key: "gcash", width: 16 },
  ];
  sheet.getRow(1).font = { bold: true };

  for (const row of rows) {
    sheet.addRow({
      name: row.name,
      days: row.daysPresent,
      basic: row.basicPay,
      lateUt: (row.lateDeduction ?? 0) + (row.undertimeDeduction ?? 0),
      ot: row.overtimePay ?? 0,
      commission: row.commission ?? 0,
      advances: row.advancesDeduction ?? 0,
      gross: row.grossPay ?? row.basicPay,
      net: row.netPay ?? row.basicPay,
      gcash: gcashFor(row.staffId) ?? "",
    });
  }

  const totalRow = sheet.addRow({
    name: "TOTAL",
    basic: rows.reduce((sum, r) => sum + r.basicPay, 0),
    lateUt: rows.reduce((sum, r) => sum + (r.lateDeduction ?? 0) + (r.undertimeDeduction ?? 0), 0),
    ot: rows.reduce((sum, r) => sum + (r.overtimePay ?? 0), 0),
    commission: rows.reduce((sum, r) => sum + (r.commission ?? 0), 0),
    advances: rows.reduce((sum, r) => sum + (r.advancesDeduction ?? 0), 0),
    gross: rows.reduce((sum, r) => sum + (r.grossPay ?? r.basicPay), 0),
    net: rows.reduce((sum, r) => sum + (r.netPay ?? r.basicPay), 0),
  });
  totalRow.font = { bold: true };
  totalRow.eachCell((cell) => {
    cell.border = { top: { style: "thin" } };
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Payroll_${run.month}${run.cut_off ? `_${run.cut_off}` : ""}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
