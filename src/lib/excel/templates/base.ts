import "server-only";
import ExcelJS from "exceljs";
import type { CategoryDef } from "../category-config";
import {
  PALETTE,
  FONT_NAME,
  argb,
  registerLogo,
  embedLogo,
  writeHeaderBar,
  writeSectionBar,
  buildLedgerSheet,
  addStatusConditionalFormat,
  dataBarRule,
} from "../style-kit";

export interface BaseTemplateData {
  businessName: string;
  category: CategoryDef;
  products: string[];
  mayUtang: boolean;
}

const MAX_ROWS = 200;

/**
 * The template used by 11 of the 16 categories (Sari-Sari, Online Seller,
 * Food Cart, Milktea/Coffee, Ukay/RTW, Bigas/Egg, Carinderia, Bake Shop,
 * GCash/Loading, Beauty Services, Other) — reverse-engineered from the
 * user-supplied SariSari_Store_System.xlsx. 10 sheets: Dashboard, Inventory,
 * Daily Sales, Daily Summary, Restock List, Utang Tracker, Monthly Report,
 * Expenses, Suppliers, Yearly Summary.
 */
export async function buildBaseWorkbook(workbook: ExcelJS.Workbook, data: BaseTemplateData) {
  const logoImageId = registerLogo(workbook);
  const products = data.products.length > 0 ? data.products : ["Produkto 1", "Produkto 2", "Produkto 3"];
  const titleText = `NEGOSYO TRACKER PH — ${data.category.label}`;

  buildDashboard(workbook, logoImageId, data, titleText);
  buildInventory(workbook, logoImageId, titleText, data, products);
  buildDailySales(workbook, logoImageId, titleText, data, products);
  buildDailySummary(workbook, logoImageId, titleText, data);
  buildRestockList(workbook, logoImageId, titleText, data, products);
  buildUtangTracker(workbook, logoImageId, titleText, data);
  buildMonthlyReport(workbook, logoImageId, titleText, data);
  buildExpenses(workbook, logoImageId, titleText, data);
  buildSuppliers(workbook, logoImageId, titleText, data);
  buildYearlySummary(workbook, logoImageId, titleText, data);
}

function buildDashboard(workbook: ExcelJS.Workbook, logoImageId: number | null, data: BaseTemplateData, titleText: string) {
  const ws = workbook.addWorksheet("1. Dashboard", { properties: { tabColor: { argb: argb(PALETTE.navy) } } });
  ws.views = [{ showGridLines: false }];
  ws.columns = [{ width: 4 }, { width: 26 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 16 }, { width: 4 }];
  embedLogo(ws, logoImageId);

  writeHeaderBar({ ws, lastCol: 8, titleText, taglineText: data.category.tagline, titleSize: 20 });

  ws.getCell("B4").value = "STORE NAME:";
  ws.getCell("B4").font = { name: FONT_NAME, size: 11, bold: true, color: { argb: argb(PALETTE.navy) } };
  const storeCell = ws.getCell("C4");
  storeCell.value = data.businessName;
  storeCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.inputBg) } };
  storeCell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: argb(PALETTE.greenDark) } };
  ws.getCell("E4").value = "DATE TODAY:";
  ws.getCell("E4").font = { name: FONT_NAME, size: 11, bold: true, color: { argb: argb(PALETTE.navy) } };
  const dateCell = ws.getCell("F4");
  dateCell.value = { formula: "TODAY()", result: new Date() };
  dateCell.numFmt = "mm/dd/yyyy";
  dateCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.inputBg) } };
  dateCell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: argb(PALETTE.greenDark) } };

  writeSectionBar(ws, 7, 2, 8, "TODAY AT A GLANCE", PALETTE.green);

  const kpi = (row: number, col: string, label: string, labelFill: string, formula: string) => {
    const labelCell = ws.getCell(`${col}${row}`);
    labelCell.value = label;
    labelCell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: argb(labelFill) } };
    const valueCol = String.fromCharCode(col.charCodeAt(0) + 1);
    const valueCell = ws.getCell(`${valueCol}${row}`);
    valueCell.value = { formula, result: 0 };
    valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.rowAlt) } };
    valueCell.font = { name: FONT_NAME, size: 11, bold: true };
    valueCell.numFmt = /Peso|Stock|Utang|Sales|Cost|Profit|Expenses/i.test(label) ? '"₱"#,##0.00' : "0";
  };

  kpi(9, "B", "Sales Today", PALETTE.green, `SUMIFS('3. Daily Sales'!F:F,'3. Daily Sales'!A:A,F4)`);
  kpi(9, "D", "Cost of Goods Today", PALETTE.blue, `SUMIFS('3. Daily Sales'!G:G,'3. Daily Sales'!A:A,F4)`);
  kpi(9, "F", "Expenses Today", PALETTE.gold, `SUMIFS('8. Expenses'!D:D,'8. Expenses'!A:A,F4)`);
  kpi(10, "B", "Net Profit Today", PALETTE.greenDark, `C9-E9-G9`);
  kpi(10, "D", "Items Sold Today", PALETTE.navy, `SUMIFS('3. Daily Sales'!D:D,'3. Daily Sales'!A:A,F4)`);
  kpi(10, "F", "Low / Out of Stock", PALETTE.gold, `COUNTIF('2. Inventory'!K:K,"LOW STOCK")+COUNTIF('2. Inventory'!K:K,"OUT OF STOCK")`);
  kpi(11, "B", "Total Stock Value", PALETTE.blue, `'2. Inventory'!I2`);
  kpi(11, "D", "Unpaid Utang", PALETTE.greenDark, `'6. Utang Tracker'!I4`);

  writeSectionBar(ws, 13, 2, 8, "LAST 7 DAYS", PALETTE.blue);
  ["DATE", "SALES", "PROFIT"].forEach((h, i) => {
    const cell = ws.getCell(14, 2 + i);
    cell.value = h;
    cell.font = { name: FONT_NAME, size: 9, bold: true, color: { argb: argb("FFFFFF") } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.navy) } };
  });
  for (let i = 0; i < 7; i++) {
    const r = 15 + i;
    const isAlt = i % 2 === 0;
    const dateCell2 = ws.getCell(`B${r}`);
    dateCell2.value = { formula: `TODAY()-${6 - i}`, result: new Date() };
    dateCell2.numFmt = "mm/dd";
    const salesCell = ws.getCell(`C${r}`);
    salesCell.value = { formula: `IFERROR(SUMIFS('4. Daily Summary'!$B:$B,'4. Daily Summary'!$A:$A,B${r}),0)`, result: 0 };
    salesCell.numFmt = '"₱"#,##0';
    const profitCell = ws.getCell(`D${r}`);
    profitCell.value = { formula: `IFERROR(SUMIFS('4. Daily Summary'!$E:$E,'4. Daily Summary'!$A:$A,B${r}),0)`, result: 0 };
    profitCell.numFmt = '"₱"#,##0';
    [dateCell2, salesCell, profitCell].forEach((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(isAlt ? PALETTE.rowAlt : PALETTE.rowWhite) } };
      c.font = { name: FONT_NAME, size: 10 };
    });
  }
  ws.addConditionalFormatting({ ref: "C15:C21", rules: [dataBarRule(PALETTE.green)] });
}

function buildInventory(workbook: ExcelJS.Workbook, logoImageId: number | null, titleText: string, data: BaseTemplateData, products: string[]) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "2. Inventory",
    tabColor: PALETTE.navy,
    sheetTitle: "INVENTORY & PRICING",
    sheetTagline: "Stock, Cost, Selling Price & Profit per Item",
    dataRowCount: MAX_ROWS,
    columns: [
      { header: "PRODUCT", headerFill: PALETTE.navy, editable: true, width: 24, seedValues: products },
      { header: "CATEGORY", headerFill: PALETTE.blue, editable: true, width: 14 },
      { header: "UNIT", headerFill: PALETTE.green, editable: true, width: 10 },
      { header: "COST PRICE", headerFill: PALETTE.navy, editable: true, numFmt: '"₱"#,##0.00' },
      { header: "SELLING PRICE", headerFill: PALETTE.navy, editable: true, numFmt: '"₱"#,##0.00' },
      { header: "PROFIT/UNIT", headerFill: PALETTE.greenDark, editable: false, numFmt: '"₱"#,##0.00', formula: (r) => `IF(AND(D${r}="",E${r}=""),"",E${r}-D${r})` },
      { header: "MARGIN %", headerFill: PALETTE.greenDark, editable: false, numFmt: '0.0"%"', formula: (r) => `IF(OR(E${r}="",E${r}=0),"",F${r}/E${r}*100)` },
      { header: "QTY IN STOCK", headerFill: PALETTE.blue, editable: true, width: 12 },
      { header: "STOCK VALUE", headerFill: PALETTE.green, editable: false, numFmt: '"₱"#,##0.00', formula: (r) => `IF(OR(D${r}="",H${r}=""),"",D${r}*H${r})` },
      { header: "REORDER LEVEL", headerFill: PALETTE.gold, editable: true, width: 13 },
      {
        header: "STATUS",
        headerFill: PALETTE.navyDark,
        editable: false,
        width: 13,
        formula: (r) => `IF(H${r}="","",IF(H${r}=0,"OUT OF STOCK",IF(H${r}<=J${r},"LOW STOCK","OK")))`,
      },
    ],
    extraHeaderBlock: (ws, lastDataRow) => {
      ws.getCell("H2").value = "TOTAL STOCK VALUE →";
      ws.getCell("H2").font = { name: FONT_NAME, size: 11, bold: true, color: { argb: argb("FFFFFF") } };
      ws.getCell("H2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.green) } };
      const totalCell = ws.getCell("I2");
      totalCell.value = { formula: `SUM(I4:I${lastDataRow})`, result: 0 };
      totalCell.numFmt = '"₱"#,##0.00';
      totalCell.font = { name: FONT_NAME, size: 13, bold: true, color: { argb: argb(PALETTE.greenDark) } };
      totalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.taglineBg) } };
      addStatusConditionalFormat(ws, `K4:K${lastDataRow}`, [
        { text: "OUT OF STOCK", fill: "FCE4E4" },
        { text: "LOW STOCK", fill: "FFF3CD" },
        { text: "OK", fill: "DFF7E8" },
      ]);
    },
  });
}

function buildDailySales(workbook: ExcelJS.Workbook, logoImageId: number | null, titleText: string, data: BaseTemplateData, products: string[]) {
  const lastInventoryRow = 3 + MAX_ROWS;
  buildLedgerSheet(workbook, logoImageId, {
    name: "3. Daily Sales",
    tabColor: PALETTE.greenDark,
    sheetTitle: "DAILY SALES LOG",
    sheetTagline: "Pick a product, type quantity — totals fill in automatically",
    dataRowCount: MAX_ROWS * 2,
    columns: [
      { header: "DATE", headerFill: PALETTE.navy, editable: true, width: 14, numFmt: "mm/dd/yyyy", seedFormula: () => "TODAY()" },
      {
        header: "PRODUCT",
        headerFill: PALETTE.green,
        editable: true,
        width: 22,
        dataValidation: () => ({
          type: "list",
          allowBlank: true,
          formulae: [`'2. Inventory'!$B$4:$B$${lastInventoryRow}`],
          showErrorMessage: true,
        }),
      },
      { header: "SELLING PRICE", headerFill: PALETTE.blue, editable: false, formula: (r) => `IF(B${r}="","",IFERROR(VLOOKUP(B${r},'2. Inventory'!$B:$E,4,0),0))` },
      { header: "QTY SOLD", headerFill: PALETTE.gold, editable: true, width: 10 },
      { header: "COST PRICE", headerFill: PALETTE.navy, editable: false, formula: (r) => `IF(B${r}="","",IFERROR(VLOOKUP(B${r},'2. Inventory'!$B:$D,3,0),0))` },
      { header: "TOTAL SALE", headerFill: PALETTE.greenDark, editable: false, numFmt: '"₱"#,##0.00', formula: (r) => `IF(B${r}="","",C${r}*D${r})` },
      { header: "TOTAL COST", headerFill: PALETTE.navy, editable: false, numFmt: '"₱"#,##0.00', formula: (r) => `IF(B${r}="","",E${r}*D${r})` },
      { header: "PROFIT", headerFill: PALETTE.greenDark, editable: false, numFmt: '"₱"#,##0.00', formula: (r) => `IF(B${r}="","",F${r}-G${r})` },
    ],
  });
}

function buildDailySummary(workbook: ExcelJS.Workbook, logoImageId: number | null, titleText: string, data: BaseTemplateData) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "4. Daily Summary",
    tabColor: PALETTE.navy,
    sheetTitle: "DAILY SUMMARY",
    sheetTagline: "Sales, Cost, Expenses & Net Profit per Day",
    dataRowCount: 1097, // ~3 years, matches the real file's H4 3-year total range
    columns: [
      { header: "DATE", headerFill: PALETTE.navy, editable: false, width: 14, numFmt: "mm/dd/yyyy", formula: (r) => (r === 4 ? "TODAY()-1096" : `A${r - 1}+1`) },
      { header: "TOTAL SALES", headerFill: PALETTE.green, editable: false, numFmt: '"₱"#,##0.00', formula: (r) => `SUMIFS('3. Daily Sales'!F:F,'3. Daily Sales'!A:A,A${r})` },
      { header: "COST OF GOODS", headerFill: PALETTE.blue, editable: false, numFmt: '"₱"#,##0.00', formula: (r) => `SUMIFS('3. Daily Sales'!G:G,'3. Daily Sales'!A:A,A${r})` },
      { header: "EXPENSES", headerFill: PALETTE.gold, editable: false, numFmt: '"₱"#,##0.00', formula: (r) => `SUMIFS('8. Expenses'!D:D,'8. Expenses'!A:A,A${r})` },
      { header: "NET PROFIT", headerFill: PALETTE.greenDark, editable: false, numFmt: '"₱"#,##0.00', formula: (r) => `B${r}-C${r}-D${r}` },
      { header: "MARGIN %", headerFill: PALETTE.navy, editable: false, numFmt: '0.0"%"', formula: (r) => `IFERROR(E${r}/B${r},0)` },
    ],
    extraHeaderBlock: (ws, lastDataRow) => {
      ws.getCell("H3").value = "3-YEAR TOTAL (Net Profit)";
      ws.getCell("H3").font = { name: FONT_NAME, size: 10, bold: true, color: { argb: argb("FFFFFF") } };
      ws.getCell("H3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.navyDark) } };
      const totalCell = ws.getCell("H4");
      totalCell.value = { formula: `SUM(E4:E${lastDataRow})`, result: 0 };
      totalCell.numFmt = '"₱"#,##0.00';
      totalCell.font = { name: FONT_NAME, size: 14, bold: true, color: { argb: argb(PALETTE.greenDark) } };
      totalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.taglineBg) } };
    },
  });
}

function buildRestockList(workbook: ExcelJS.Workbook, logoImageId: number | null, titleText: string, data: BaseTemplateData, products: string[]) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "5. Restock List",
    tabColor: PALETTE.gold,
    sheetTitle: "RESTOCK ALERT",
    sheetTagline: "Auto-updates from Inventory. I-edit ang stock sa INVENTORY tab — huwag dito.",
    dataRowCount: MAX_ROWS,
    columns: [
      { header: "PRODUCT", headerFill: PALETTE.navy, editable: false, width: 24, formula: (r) => `IF(AND('2. Inventory'!B${r}<>"",'2. Inventory'!K${r}<>"OK",'2. Inventory'!K${r}<>""),'2. Inventory'!B${r},"")` },
      { header: "CATEGORY", headerFill: PALETTE.blue, editable: false, formula: (r) => `IF(AND('2. Inventory'!B${r}<>"",'2. Inventory'!K${r}<>"OK",'2. Inventory'!K${r}<>""),'2. Inventory'!C${r},"")` },
      { header: "QTY IN STOCK", headerFill: PALETTE.navy, editable: false, formula: (r) => `IF(AND('2. Inventory'!B${r}<>"",'2. Inventory'!K${r}<>"OK",'2. Inventory'!K${r}<>""),'2. Inventory'!H${r},"")` },
      { header: "REORDER LEVEL", headerFill: PALETTE.green, editable: false, formula: (r) => `IF(AND('2. Inventory'!B${r}<>"",'2. Inventory'!K${r}<>"OK",'2. Inventory'!K${r}<>""),'2. Inventory'!J${r},"")` },
      { header: "STATUS", headerFill: PALETTE.navyDark, editable: false, formula: (r) => `IF(AND('2. Inventory'!B${r}<>"",'2. Inventory'!K${r}<>"OK",'2. Inventory'!K${r}<>""),'2. Inventory'!K${r},"")` },
      { header: "SUGGESTED ORDER", headerFill: PALETTE.gold, editable: false, width: 17, formula: (r) => `IF(E${r}="","",IF(D${r}*2-C${r}>0,D${r}*2-C${r},D${r}))` },
    ],
    extraHeaderBlock: (ws, lastDataRow) => {
      addStatusConditionalFormat(ws, `E4:E${lastDataRow}`, [
        { text: "OUT OF STOCK", fill: "FCE4E4" },
        { text: "LOW STOCK", fill: "FFF3CD" },
      ]);
    },
  });
}

function buildUtangTracker(workbook: ExcelJS.Workbook, logoImageId: number | null, titleText: string, data: BaseTemplateData) {
  if (!data.mayUtang) {
    const ws = workbook.addWorksheet("6. Utang Tracker", { properties: { tabColor: { argb: argb(PALETTE.greenDark) } } });
    ws.views = [{ showGridLines: false }];
    ws.columns = [{ width: 60 }];
    const cell = ws.getCell("A1");
    cell.value = "Naka-off ang Utang tracking para sa negosyong ito (walang utang na binebenta).";
    cell.font = { name: FONT_NAME, size: 12, italic: true, color: { argb: argb("888888") } };
    return;
  }
  buildLedgerSheet(workbook, logoImageId, {
    name: "6. Utang Tracker",
    tabColor: PALETTE.greenDark,
    sheetTitle: "UTANG (CREDIT) TRACKER",
    sheetTagline: "Who Owes, How Much, Paid or Not",
    dataRowCount: MAX_ROWS - 1,
    columns: [
      { header: "DATE", headerFill: PALETTE.navy, editable: true, width: 14, numFmt: "mm/dd/yyyy", seedFormula: () => "TODAY()" },
      { header: "CUSTOMER NAME", headerFill: PALETTE.green, editable: true, width: 18 },
      { header: "ITEM / DESCRIPTION", headerFill: PALETTE.blue, editable: true, width: 22 },
      { header: "AMOUNT", headerFill: PALETTE.navy, editable: true, numFmt: '"₱"#,##0.00' },
      { header: "AMOUNT PAID", headerFill: PALETTE.greenDark, editable: true, numFmt: '"₱"#,##0.00' },
      { header: "BALANCE", headerFill: PALETTE.gold, editable: false, numFmt: '"₱"#,##0.00', formula: (r) => `IF(B${r}="","",D${r}-E${r})` },
      { header: "STATUS", headerFill: PALETTE.navyDark, editable: false, formula: (r) => `IF(B${r}="","",IF(F${r}<=0,"PAID","UNPAID"))` },
    ],
    extraHeaderBlock: (ws, lastDataRow) => {
      ws.getCell("H3").value = "TOTAL UNPAID UTANG";
      ws.getCell("H3").font = { name: FONT_NAME, size: 11, bold: true, color: { argb: argb("FFFFFF") } };
      ws.getCell("H3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.red) } };
      const totalCell = ws.getCell("H4");
      totalCell.value = { formula: `SUMIF(G4:G${lastDataRow},"UNPAID",F4:F${lastDataRow})`, result: 0 };
      totalCell.numFmt = '"₱"#,##0.00';
      totalCell.font = { name: FONT_NAME, size: 16, bold: true, color: { argb: argb(PALETTE.red) } };
      totalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.taglineBg) } };
      addStatusConditionalFormat(ws, `G4:G${lastDataRow}`, [{ text: "UNPAID", fill: "FCE4E4" }]);
    },
  });
}

function buildMonthlyReport(workbook: ExcelJS.Workbook, logoImageId: number | null, titleText: string, data: BaseTemplateData) {
  const ws = workbook.addWorksheet("7. Monthly Report", { properties: { tabColor: { argb: argb(PALETTE.navyDark) } } });
  ws.views = [{ showGridLines: false }];
  ws.columns = [{ width: 4 }, { width: 14 }, { width: 14 }, { width: 13 }, { width: 14 }, { width: 12 }, { width: 10 }];
  embedLogo(ws, logoImageId);
  writeHeaderBar({ ws, lastCol: 7, titleText: "MONTHLY PROFIT REPORT", taglineText: "End-of-Month Sales, Cost, Expenses & Profit", titleFill: PALETTE.navyDark, titleSize: 18 });

  ws.getCell("B4").value = "YEAR:";
  ws.getCell("B4").font = { name: FONT_NAME, size: 11, bold: true, color: { argb: argb(PALETTE.navy) } };
  const yearCell = ws.getCell("C4");
  yearCell.value = { formula: "YEAR(TODAY())", result: 2026 };
  yearCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.inputBg) } };
  yearCell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: argb(PALETTE.greenDark) } };

  writeSectionBar(ws, 6, 2, 7, "MONTH TOTALS", PALETTE.green);
  ["MONTH", "TOTAL SALES", "COST OF GOODS", "EXPENSES", "NET PROFIT", "MARGIN %", "BEST?"].forEach((h, i) => {
    const cell = ws.getCell(7, 2 + i);
    cell.value = h;
    cell.font = { name: FONT_NAME, size: 9, bold: true, color: { argb: argb("FFFFFF") } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.navy) } };
  });

  for (let m = 1; m <= 12; m++) {
    const r = 7 + m;
    const isAlt = m % 2 === 1;
    const monthCell = ws.getCell(`B${r}`);
    monthCell.value = { formula: `TEXT(DATE(1,${m},1),"mmmm")`, result: "" };
    const salesCell = ws.getCell(`C${r}`);
    salesCell.value = { formula: `SUMIFS('3. Daily Sales'!$F:$F,'3. Daily Sales'!$A:$A,">="&DATE($C$4,${m},1),'3. Daily Sales'!$A:$A,"<"&EDATE(DATE($C$4,${m},1),1))`, result: 0 };
    salesCell.numFmt = '"₱"#,##0.00';
    const costCell = ws.getCell(`D${r}`);
    costCell.value = { formula: `SUMIFS('3. Daily Sales'!$G:$G,'3. Daily Sales'!$A:$A,">="&DATE($C$4,${m},1),'3. Daily Sales'!$A:$A,"<"&EDATE(DATE($C$4,${m},1),1))`, result: 0 };
    costCell.numFmt = '"₱"#,##0.00';
    const expCell = ws.getCell(`E${r}`);
    expCell.value = { formula: `SUMIFS('8. Expenses'!$D:$D,'8. Expenses'!$A:$A,">="&DATE($C$4,${m},1),'8. Expenses'!$A:$A,"<"&EDATE(DATE($C$4,${m},1),1))`, result: 0 };
    expCell.numFmt = '"₱"#,##0.00';
    const profitCell = ws.getCell(`F${r}`);
    profitCell.value = { formula: `C${r}-D${r}-E${r}`, result: 0 };
    profitCell.numFmt = '"₱"#,##0.00';
    const marginCell = ws.getCell(`G${r}`);
    marginCell.value = { formula: `IFERROR(F${r}/C${r},0)`, result: 0 };
    marginCell.numFmt = "0.0%";
    const bestCell = ws.getCell(`H${r}`);
    bestCell.value = { formula: `IF(AND(F${r}>0,F${r}=MAX($F$8:$F$19)),"BEST","")`, result: "" };

    [monthCell, salesCell, costCell, expCell, profitCell, marginCell, bestCell].forEach((c) => {
      c.font = { name: FONT_NAME, size: 10, ...(c === monthCell ? { bold: true } : {}) };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(isAlt ? PALETTE.rowAlt : PALETTE.rowWhite) } };
    });
  }
  addStatusConditionalFormat(ws, "H8:H19", [{ text: "BEST", fill: "DFF7E8" }]);
}

function buildExpenses(workbook: ExcelJS.Workbook, logoImageId: number | null, titleText: string, data: BaseTemplateData) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "8. Expenses",
    tabColor: PALETTE.gold,
    sheetTitle: "EXPENSE TRACKER",
    sheetTagline: "Record store expenses — rent, load, electricity, transpo, etc.",
    dataRowCount: MAX_ROWS * 2,
    columns: [
      { header: "DATE", headerFill: PALETTE.navy, editable: true, width: 14, numFmt: "mm/dd/yyyy", seedFormula: () => "TODAY()" },
      {
        header: "CATEGORY",
        headerFill: PALETTE.green,
        editable: true,
        width: 20,
        dataValidation: () => ({
          type: "list",
          allowBlank: true,
          formulae: ['"Kuryente / Electricity,Upa / Rent,Tubig / Water,Load / Internet,Transportation,Supplies,Salaries,Repairs,Iba pa / Others"'],
          showErrorMessage: true,
        }),
      },
      { header: "DESCRIPTION", headerFill: PALETTE.blue, editable: true, width: 24 },
      { header: "AMOUNT", headerFill: PALETTE.gold, editable: true, numFmt: '"₱"#,##0.00' },
      { header: "NOTES", headerFill: PALETTE.navyDark, editable: true, width: 18 },
    ],
    extraHeaderBlock: (ws, lastDataRow) => {
      ws.getCell("G3").value = "TOTAL EXPENSES (all)";
      ws.getCell("G3").font = { name: FONT_NAME, size: 10, bold: true, color: { argb: argb("FFFFFF") } };
      ws.getCell("G3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.navyDark) } };
      const totalCell = ws.getCell("G4");
      totalCell.value = { formula: `SUM(D4:D${lastDataRow})`, result: 0 };
      totalCell.numFmt = '"₱"#,##0.00';
      totalCell.font = { name: FONT_NAME, size: 15, bold: true, color: { argb: argb(PALETTE.gold) } };
      totalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.taglineBg) } };
    },
  });
}

function buildSuppliers(workbook: ExcelJS.Workbook, logoImageId: number | null, titleText: string, data: BaseTemplateData) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "9. Suppliers",
    tabColor: PALETTE.blue,
    sheetTitle: "SUPPLIER LIST",
    sheetTagline: "Saan bumili — contact, items, at presyo ng supplier mo",
    dataRowCount: MAX_ROWS - 1,
    columns: [
      { header: "SUPPLIER NAME", headerFill: PALETTE.navy, editable: true, width: 24 },
      { header: "CONTACT NUMBER", headerFill: PALETTE.green, editable: true, width: 17 },
      { header: "ITEMS SUPPLIED", headerFill: PALETTE.blue, editable: true, width: 24 },
      { header: "LOCATION", headerFill: PALETTE.greenDark, editable: true, width: 16 },
      { header: "TERMS", headerFill: PALETTE.gold, editable: true, width: 14 },
      { header: "NOTES", headerFill: PALETTE.navyDark, editable: true, width: 22 },
    ],
  });
}

function buildYearlySummary(workbook: ExcelJS.Workbook, logoImageId: number | null, titleText: string, data: BaseTemplateData) {
  const ws = workbook.addWorksheet("10. Yearly Summary", { properties: { tabColor: { argb: argb(PALETTE.greenDark) } } });
  ws.views = [{ showGridLines: false }];
  ws.columns = [{ width: 4 }, { width: 12 }, { width: 15 }, { width: 14 }, { width: 13 }, { width: 15 }];
  embedLogo(ws, logoImageId);
  writeHeaderBar({ ws, lastCol: 6, titleText: "YEARLY SUMMARY", taglineText: "Year-on-year totals — sales, expenses & net profit", titleFill: PALETTE.greenDark, titleSize: 18 });

  writeSectionBar(ws, 6, 2, 6, "YEAR-BY-YEAR TOTALS", PALETTE.green);
  ["YEAR", "TOTAL SALES", "TOTAL EXPENSES", "NET PROFIT", "MARGIN %"].forEach((h, i) => {
    const cell = ws.getCell(7, 2 + i);
    cell.value = h;
    cell.font = { name: FONT_NAME, size: 9, bold: true, color: { argb: argb("FFFFFF") } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.navy) } };
  });

  for (let i = 0; i < 5; i++) {
    const r = 8 + i;
    const isAlt = i % 2 === 0;
    const yearCell = ws.getCell(`B${r}`);
    yearCell.value = { formula: `YEAR(TODAY())-${4 - i}`, result: 2022 + i };
    const salesCell = ws.getCell(`C${r}`);
    salesCell.value = { formula: `SUMIFS('3. Daily Sales'!$F:$F,'3. Daily Sales'!$A:$A,">="&DATE(B${r},1,1),'3. Daily Sales'!$A:$A,"<"&DATE(B${r}+1,1,1))`, result: 0 };
    salesCell.numFmt = '"₱"#,##0.00';
    const expCell = ws.getCell(`D${r}`);
    expCell.value = { formula: `SUMIFS('8. Expenses'!$D:$D,'8. Expenses'!$A:$A,">="&DATE(B${r},1,1),'8. Expenses'!$A:$A,"<"&DATE(B${r}+1,1,1))`, result: 0 };
    expCell.numFmt = '"₱"#,##0.00';
    const profitCell = ws.getCell(`E${r}`);
    profitCell.value = { formula: `C${r}-D${r}`, result: 0 };
    profitCell.numFmt = '"₱"#,##0.00';
    const marginCell = ws.getCell(`F${r}`);
    marginCell.value = { formula: `IFERROR(E${r}/C${r},0)`, result: 0 };
    marginCell.numFmt = "0.0%";
    [yearCell, salesCell, expCell, profitCell, marginCell].forEach((c) => {
      c.font = { name: FONT_NAME, size: 10, ...(c === yearCell ? { bold: true } : {}) };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(isAlt ? PALETTE.rowAlt : PALETTE.rowWhite) } };
    });
  }
}
