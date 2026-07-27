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
  dataBarRule,
} from "../style-kit";

export interface PandesalTemplateData {
  businessName: string;
  category: CategoryDef;
  products: string[]; // bread product names
  mayUtang: boolean; // unused — Pandesal Rolling has no utang concept
}

const AREA_ROWS = 20;

/**
 * Pandesal Rolling (bread delivery/route) template — reverse-engineered
 * from NegosyoTracker_Pandesal_1.xlsx. Core scope (7 of the real file's 11
 * sheets): Dashboard, Areas, Production, Pack Converter, Seller Allocation,
 * Accountability, Route Planner. Deferred: Area Performance, Heatmap,
 * Forecast, Reports (all analytics/reporting add-ons).
 */
export async function buildPandesalWorkbook(workbook: ExcelJS.Workbook, data: PandesalTemplateData) {
  const logoImageId = registerLogo(workbook);
  const products = data.products.length > 0 ? data.products : ["Classic Pandesal", "Ube Pandesal", "Malunggay Pandesal"];
  const titleText = `NEGOSYO TRACKER PH — ${data.category.label}`;

  buildDashboard(workbook, logoImageId, data, titleText);
  buildAreas(workbook, logoImageId);
  buildProduction(workbook, logoImageId, products);
  buildPackConverter(workbook, logoImageId);
  buildSellerAllocation(workbook, logoImageId);
  buildAccountability(workbook, logoImageId);
  buildRoutePlanner(workbook, logoImageId);
}

function buildDashboard(workbook: ExcelJS.Workbook, logoImageId: number | null, data: PandesalTemplateData, titleText: string) {
  const ws = workbook.addWorksheet("1. Dashboard", { properties: { tabColor: { argb: argb(PALETTE.navy) } } });
  ws.views = [{ showGridLines: false }];
  ws.columns = [{ width: 4 }, { width: 24 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 4 }];
  embedLogo(ws, logoImageId);

  writeHeaderBar({ ws, lastCol: 9, titleText, taglineText: data.category.tagline, titleSize: 18 });

  ws.getCell("B4").value = "BAKERY / BRANCH:";
  ws.getCell("B4").font = { name: FONT_NAME, size: 11, bold: true, color: { argb: argb(PALETTE.navy) } };
  const nameCell = ws.getCell("C4");
  nameCell.value = data.businessName;
  nameCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.inputBg) } };
  nameCell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: argb(PALETTE.greenDark) } };
  ws.getCell("E4").value = "DATE TODAY:";
  ws.getCell("E4").font = { name: FONT_NAME, size: 11, bold: true, color: { argb: argb(PALETTE.navy) } };
  const dateCell = ws.getCell("F4");
  dateCell.value = { formula: "TODAY()", result: new Date() };
  dateCell.numFmt = "mm/dd/yyyy";
  dateCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.inputBg) } };
  dateCell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: argb(PALETTE.greenDark) } };

  writeSectionBar(ws, 7, 2, 9, "TODAY AT A GLANCE", PALETTE.green);

  const kpi = (row: number, col: string, label: string, labelFill: string, formula: string, isMoney = false) => {
    const labelCell = ws.getCell(`${col}${row}`);
    labelCell.value = label;
    labelCell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: argb(labelFill) } };
    const valueCol = String.fromCharCode(col.charCodeAt(0) + 1);
    const valueCell = ws.getCell(`${valueCol}${row}`);
    valueCell.value = { formula, result: 0 };
    valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.rowAlt) } };
    valueCell.font = { name: FONT_NAME, size: 11, bold: true };
    if (isMoney) valueCell.numFmt = '"₱"#,##0.00';
  };

  kpi(9, "B", "Total Produced (pcs)", PALETTE.brown, `'3. Production'!D8`);
  kpi(9, "D", "Total Allocated (pcs)", PALETTE.blue, `SUM('5. Seller Allocation'!C8:C${8 + AREA_ROWS})`);
  kpi(9, "F", "Total Sold (pcs)", PALETTE.greenDark, `SUM('5. Seller Allocation'!D8:D${8 + AREA_ROWS})`);
  kpi(9, "H", "Expected Collection", PALETTE.teal, `'6. Accountability'!C5`, true);
  kpi(10, "B", "Damaged", PALETTE.red, `SUM('5. Seller Allocation'!F8:F${8 + AREA_ROWS})`);
  kpi(10, "D", "Missing", PALETTE.redLight, `SUM('5. Seller Allocation'!G8:G${8 + AREA_ROWS})`);
  kpi(10, "F", "Active Areas", PALETTE.purple, `COUNTA('2. Areas'!B4:B${4 + AREA_ROWS})-COUNTBLANK('2. Areas'!B4:B${4 + AREA_ROWS})`);
  kpi(10, "H", "Collection Received", PALETTE.greenDark, `'6. Accountability'!C6`, true);

  writeSectionBar(ws, 12, 2, 9, "LAST 7 DAYS — PRODUCTION", PALETTE.blue);
  ["DAY", "PIECES BAKED"].forEach((h, i) => {
    const cell = ws.getCell(13, 2 + i);
    cell.value = h;
    cell.font = { name: FONT_NAME, size: 9, bold: true, color: { argb: argb("FFFFFF") } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.navy) } };
  });
  for (let i = 0; i < 7; i++) {
    const r = 14 + i;
    const isAlt = i % 2 === 0;
    const dayCell = ws.getCell(`B${r}`);
    dayCell.value = { formula: `TEXT(TODAY()-${6 - i},"ddd, mmm d")`, result: "" };
    const piecesCell = ws.getCell(`C${r}`);
    piecesCell.value = { formula: `'3. Production'!$D$8`, result: 0 };
    [dayCell, piecesCell].forEach((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(isAlt ? PALETTE.rowAlt : PALETTE.rowWhite) } };
      c.font = { name: FONT_NAME, size: 10 };
    });
  }
  ws.addConditionalFormatting({ ref: "C14:C20", rules: [dataBarRule(PALETTE.brown)] });
}

function buildAreas(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "2. Areas",
    tabColor: PALETTE.navyDark,
    sheetTitle: "AREA ASSIGNMENT",
    sheetTagline: "Territories, sellers, vehicles & targets",
    dataRowCount: AREA_ROWS,
    columns: [
      { header: "AREA CODE", headerFill: PALETTE.navy, editable: true, width: 11 },
      { header: "AREA NAME", headerFill: PALETTE.blue, editable: true, width: 18 },
      { header: "ASSIGNED SELLER", headerFill: PALETTE.green, editable: true, width: 16 },
      { header: "VEHICLE", headerFill: PALETTE.blueLight, editable: true, width: 14 },
      { header: "DAILY TARGET (pcs)", headerFill: PALETTE.gold, editable: true, width: 15 },
      { header: "EXPECTED SALES (₱)", headerFill: PALETTE.greenDark, editable: true, width: 16, numFmt: '"₱"#,##0.00' },
    ],
  });
}

function buildProduction(workbook: ExcelJS.Workbook, logoImageId: number | null, products: string[]) {
  const ws = workbook.addWorksheet("3. Production", { properties: { tabColor: { argb: argb(PALETTE.navyDark) } } });
  ws.views = [{ showGridLines: false }];
  ws.columns = [{ width: 4 }, { width: 24 }, { width: 14 }, { width: 16 }, { width: 15 }];
  embedLogo(ws, logoImageId);
  writeHeaderBar({ ws, lastCol: 4, titleText: "DAILY PRODUCTION", taglineText: "Total pieces baked per product", titleFill: PALETTE.navyDark, titleSize: 18 });

  ["PRODUCT", "UNIT COST (₱)", "SELLING PRICE (₱)", "PRODUCED (pcs)"].forEach((h, i) => {
    const cell = ws.getCell(3, 2 + i);
    cell.value = h;
    cell.font = { name: FONT_NAME, size: 9, bold: true, color: { argb: argb("FFFFFF") } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(i === 1 ? PALETTE.gold : i === 2 ? PALETTE.greenDark : i === 3 ? PALETTE.brown : PALETTE.navy) } };
  });

  const rows = products.slice(0, 10);
  rows.forEach((product, i) => {
    const r = 4 + i;
    const isAlt = i % 2 === 0;
    const nameCell = ws.getCell(`B${r}`);
    nameCell.value = product;
    const costCell = ws.getCell(`C${r}`);
    costCell.numFmt = '"₱"#,##0.00';
    const priceCell = ws.getCell(`D${r}`);
    priceCell.numFmt = '"₱"#,##0.00';
    const producedCell = ws.getCell(`E${r}`);
    [nameCell, costCell, priceCell, producedCell].forEach((c) => {
      c.font = { name: FONT_NAME, size: 10, ...(c === nameCell || c === producedCell ? { bold: true, color: { argb: argb(c === producedCell ? PALETTE.brown : PALETTE.navy) } } : {}) };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(isAlt ? PALETTE.rowAlt : PALETTE.rowWhite) } };
      c.protection = { locked: false };
    });
  });

  const totalRow = 4 + rows.length + 1;
  ws.getCell(`B${totalRow}`).value = "TOTAL PRODUCED";
  ws.getCell(`B${totalRow}`).font = { name: FONT_NAME, size: 11, bold: true, color: { argb: argb(PALETTE.navy) } };
  const totalCell = ws.getCell(`D${totalRow}`);
  totalCell.value = { formula: `SUM(E4:E${3 + rows.length})`, result: 0 };
  totalCell.font = { name: FONT_NAME, size: 13, bold: true, color: { argb: argb(PALETTE.brown) } };
  totalCell.protection = { locked: true };
}

function buildPackConverter(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  const ws = workbook.addWorksheet("4. Pack Converter", { properties: { tabColor: { argb: argb(PALETTE.navyDark) } } });
  ws.views = [{ showGridLines: false }];
  ws.columns = [{ width: 4 }, { width: 20 }, { width: 10 }, { width: 10 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 11 }, { width: 14 }];
  embedLogo(ws, logoImageId);
  writeHeaderBar({ ws, lastCol: 8, titleText: "BUNDLE / PACK TRACKING", taglineText: "Auto-convert packs into total pieces", titleFill: PALETTE.navyDark, titleSize: 16 });

  ws.mergeCells("B4:I4");
  const noteCell = ws.getCell("B4");
  noteCell.value = "Enter how many packs of each size per seller. Total pieces auto-computed. (per pc=1, packs of 5/10/20/25/50)";
  noteCell.font = { name: FONT_NAME, size: 9, bold: true, italic: true, color: { argb: argb(PALETTE.navy) } };

  const headers = ["SELLER / AREA", "×1 (pcs)", "×5 packs", "×10 packs", "×20 packs", "×25 packs", "×50 packs", "TOTAL PIECES"];
  const colors = [PALETTE.navy, PALETTE.blue, PALETTE.blueLight, PALETTE.teal, PALETTE.green, PALETTE.gold, PALETTE.purple, PALETTE.greenDark];
  headers.forEach((h, i) => {
    const cell = ws.getCell(6, 2 + i);
    cell.value = h;
    cell.font = { name: FONT_NAME, size: 9, bold: true, color: { argb: argb("FFFFFF") } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(colors[i]) } };
  });

  for (let i = 0; i < AREA_ROWS; i++) {
    const r = 7 + i;
    const isAlt = i % 2 === 0;
    const sellerCell = ws.getCell(`B${r}`);
    const totalCell = ws.getCell(`I${r}`);
    totalCell.value = { formula: `IF(B${r}="","",C${r}*1+D${r}*5+E${r}*10+F${r}*20+G${r}*25+H${r}*50)`, result: 0 };
    ["C", "D", "E", "F", "G", "H"].forEach((col) => {
      const cell = ws.getCell(`${col}${r}`);
      cell.font = { name: FONT_NAME, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(isAlt ? PALETTE.rowAlt : PALETTE.rowWhite) } };
      cell.protection = { locked: false };
    });
    sellerCell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: argb(PALETTE.navy) } };
    sellerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(isAlt ? PALETTE.rowAlt : PALETTE.rowWhite) } };
    sellerCell.protection = { locked: false };
    totalCell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: argb(PALETTE.greenDark) } };
    totalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(isAlt ? PALETTE.rowAlt : PALETTE.rowWhite) } };
    totalCell.protection = { locked: true };
  }
}

function buildSellerAllocation(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  const ws = workbook.addWorksheet("5. Seller Allocation", { properties: { tabColor: { argb: argb(PALETTE.navyDark) } } });
  ws.views = [{ showGridLines: false }];
  ws.columns = [{ width: 4 }, { width: 15 }, { width: 18 }, { width: 11 }, { width: 9 }, { width: 10 }, { width: 10 }, { width: 9 }, { width: 12 }, { width: 10 }, { width: 13 }, { width: 13 }];
  embedLogo(ws, logoImageId);
  writeHeaderBar({ ws, lastCol: 11, titleText: "SELLER ALLOCATION & RECONCILIATION", taglineText: "Assigned = Sold + Returned + Damaged + Missing", titleFill: PALETTE.navyDark, titleSize: 16 });

  ws.getCell("B4").value = "TOTAL PRODUCED (all products) →";
  ws.getCell("B4").font = { name: FONT_NAME, size: 10, bold: true, color: { argb: argb(PALETTE.navy) } };
  const totalProducedCell = ws.getCell("C4");
  totalProducedCell.value = { formula: "'3. Production'!D8", result: 0 };
  totalProducedCell.font = { name: FONT_NAME, size: 12, bold: true, color: { argb: argb(PALETTE.brown) } };
  totalProducedCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.taglineBg) } };

  ws.getCell("E4").value = "TOTAL ALLOCATED →";
  ws.getCell("E4").font = { name: FONT_NAME, size: 10, bold: true, color: { argb: argb(PALETTE.navy) } };
  const totalAllocCell = ws.getCell("F4");
  totalAllocCell.value = { formula: `SUM(C8:C${8 + AREA_ROWS})`, result: 0 };
  totalAllocCell.font = { name: FONT_NAME, size: 12, bold: true, color: { argb: argb(PALETTE.blue) } };
  totalAllocCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.taglineBg) } };

  ws.getCell("H4").value = "VALIDATION:";
  ws.getCell("H4").font = { name: FONT_NAME, size: 10, bold: true, color: { argb: argb(PALETTE.navy) } };
  const validationCell = ws.getCell("I4");
  validationCell.value = { formula: `IF(F4>C4,"OVER-ALLOCATED!",IF(F4=C4,"BALANCED","OK (under)"))`, result: "" };
  validationCell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: argb(PALETTE.navy) } };

  const headers = ["SELLER", "AREA", "ALLOCATED", "SOLD", "RETURNED", "DAMAGED", "MISSING", "UNACCOUNTED", "PRICE", "REVENUE", "STATUS"];
  headers.forEach((h, i) => {
    const cell = ws.getCell(7, 2 + i);
    cell.value = h;
    cell.font = { name: FONT_NAME, size: 9, bold: true, color: { argb: argb("FFFFFF") } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.navy) } };
  });
  for (let i = 0; i < AREA_ROWS; i++) {
    const r = 8 + i;
    const isAlt = i % 2 === 0;
    const unaccCell = ws.getCell(`I${r}`);
    unaccCell.value = { formula: `IF(B${r}="","",C${r}-D${r}-E${r}-F${r}-G${r})`, result: 0 };
    const revCell = ws.getCell(`K${r}`);
    revCell.value = { formula: `IF(B${r}="","",D${r}*J${r})`, result: 0 };
    revCell.numFmt = '"₱"#,##0.00';
    const statusCell = ws.getCell(`L${r}`);
    statusCell.value = { formula: `IF(B${r}="","",IF(I${r}=0,"BALANCED","CHECK!"))`, result: "" };
    ["B", "C", "D", "E", "F", "G", "H", "J"].forEach((col) => {
      const cell = ws.getCell(`${col}${r}`);
      cell.font = { name: FONT_NAME, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(isAlt ? PALETTE.rowAlt : PALETTE.rowWhite) } };
      cell.protection = { locked: false };
    });
    [unaccCell, revCell, statusCell].forEach((cell) => {
      cell.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: argb(PALETTE.greenDark) } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(isAlt ? PALETTE.rowAlt : PALETTE.rowWhite) } };
      cell.protection = { locked: true };
    });
  }
  ws.addConditionalFormatting({
    ref: `L8:L${7 + AREA_ROWS}`,
    rules: [
      { type: "containsText", operator: "containsText", text: "CHECK!", priority: 1, style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: argb("FCE4E4") } } } },
      { type: "containsText", operator: "containsText", text: "BALANCED", priority: 2, style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: argb("DFF7E8") } } } },
    ],
  });
}

function buildAccountability(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  const ws = workbook.addWorksheet("6. Accountability", { properties: { tabColor: { argb: argb(PALETTE.navyDark) } } });
  ws.views = [{ showGridLines: false }];
  ws.columns = [{ width: 4 }, { width: 30 }, { width: 15 }];
  embedLogo(ws, logoImageId);
  writeHeaderBar({ ws, lastCol: 2, titleText: "DAILY ACCOUNTABILITY REPORT", taglineText: "Production → allocation → reconciliation → collection", titleFill: PALETTE.navyDark, titleSize: 16 });

  const rows: Array<{ label: string; formula: string; isMoney?: boolean }> = [
    { label: "Production (pcs)", formula: "'3. Production'!D8" },
    { label: "Allocated (pcs)", formula: `SUM('5. Seller Allocation'!C8:C${8 + AREA_ROWS})` },
    { label: "Sold (pcs)", formula: `SUM('5. Seller Allocation'!D8:D${8 + AREA_ROWS})` },
    { label: "Returned (pcs)", formula: `SUM('5. Seller Allocation'!E8:E${8 + AREA_ROWS})` },
    { label: "Damaged (pcs)", formula: `SUM('5. Seller Allocation'!F8:F${8 + AREA_ROWS})` },
    { label: "Missing (pcs)", formula: `SUM('5. Seller Allocation'!G8:G${8 + AREA_ROWS})` },
    { label: "Expected Collection (₱)", formula: `SUM('5. Seller Allocation'!K8:K${8 + AREA_ROWS})`, isMoney: true },
    { label: "Collection Received (₱)", formula: "0", isMoney: true },
  ];
  rows.forEach((row, i) => {
    const r = 4 + i;
    const isAlt = i % 2 === 0;
    const labelCell = ws.getCell(`B${r}`);
    labelCell.value = row.label;
    labelCell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: argb(PALETTE.textDark) } };
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(isAlt ? PALETTE.rowAlt : PALETTE.rowWhite) } };
    const valueCell = ws.getCell(`C${r}`);
    valueCell.value = row.label.includes("Received") ? 0 : { formula: row.formula, result: 0 };
    if (row.label.includes("Received")) valueCell.protection = { locked: false };
    if (row.isMoney) valueCell.numFmt = '"₱"#,##0.00';
    valueCell.font = { name: FONT_NAME, size: 12, bold: true, color: { argb: argb(PALETTE.greenDark) } };
    valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.taglineBg) } };
  });

  const unaccRow = 4 + rows.length + 1;
  ws.getCell(`B${unaccRow}`).value = "Unaccounted (pcs)";
  ws.getCell(`B${unaccRow}`).font = { name: FONT_NAME, size: 11, bold: true, color: { argb: argb(PALETTE.red) } };
  const unaccCell = ws.getCell(`C${unaccRow}`);
  unaccCell.value = { formula: "C4-C6-C7-C8-C9", result: 0 };
  unaccCell.font = { name: FONT_NAME, size: 12, bold: true, color: { argb: argb(PALETTE.red) } };
}

function buildRoutePlanner(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "7. Route Planner",
    tabColor: PALETTE.navyDark,
    sheetTitle: "ROLLING ROUTE PLANNER",
    sheetTagline: "Route times, fuel cost & profitability",
    dataRowCount: AREA_ROWS,
    columns: [
      { header: "ROLLING UNIT", headerFill: PALETTE.navy, editable: true, width: 13 },
      { header: "AREA", headerFill: PALETTE.blue, editable: true, width: 18 },
      { header: "START", headerFill: PALETTE.blueLight, editable: true, width: 9 },
      { header: "END", headerFill: PALETTE.blueLight, editable: true, width: 9 },
      { header: "DISTANCE (km)", headerFill: PALETTE.teal, editable: true, width: 12 },
      { header: "FUEL COST (₱)", headerFill: PALETTE.gold, editable: true, width: 13, numFmt: '"₱"#,##0.00' },
      { header: "COLLECTION (₱)", headerFill: PALETTE.greenDark, editable: true, width: 14, numFmt: '"₱"#,##0.00' },
      { header: "ROUTE PROFIT (₱)", headerFill: PALETTE.green, editable: false, width: 15, formula: (r) => `IF(B${r}="","",G${r}-F${r})`, numFmt: '"₱"#,##0.00' },
    ],
    extraHeaderBlock: (ws, lastDataRow) => {
      ws.addConditionalFormatting({ ref: `I4:I${lastDataRow}`, rules: [dataBarRule(PALETTE.green)] });
    },
  });
}
