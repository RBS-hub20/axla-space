import "server-only";
import ExcelJS from "exceljs";

/**
 * exceljs's own DataBarRuleType type declaration omits `color`, but its
 * runtime XML writer (lib/xlsx/xform/sheet/cf/databar-xform.js) reads
 * `model.color` directly and renders it — a real gap between the published
 * .d.ts and the actual implementation, not a typo here.
 */
type DataBarRuleWithColor = ExcelJS.DataBarRuleType & { color: { argb: string } };

export interface NegosyoTrackerData {
  businessName: string;
  logoBase64?: string | null;
  color1: string;
  color2: string;
  category: string;
  products: string[];
  mayUtang: boolean;
}

const FONT_NAME = "Calibri";
const FONT_SIZE = 11;
const WHITE = "FFFFFFFF";
const GRAY_LOCKED = "FFF2F2F2";
const RED_TEXT = "FFCC0000";
const GREEN_FILL = "FFDFF7E8";
const YELLOW_FILL = "FFFFF3CD";
const RED_FILL = "FFFCE4E4";

/** "#00FF88" -> "FF00FF88" (exceljs ARGB, alpha channel forced opaque). */
function toArgb(hex: string, fallback: string): string {
  const clean = /^#?[0-9a-fA-F]{6}$/.test(hex) ? hex.replace("#", "") : fallback.replace("#", "");
  return `FF${clean.toUpperCase()}`;
}

/** Best-effort readable text color against a given fill — light fills get dark text, dark fills get white text. */
function contrastText(argbFill: string): string {
  const hex = argbFill.slice(2);
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "FF0B0F1A" : "FFFFFFFF";
}

function parseLogo(logoBase64: string | null | undefined): { base64: string; extension: "png" | "jpeg" | "gif" } | null {
  if (!logoBase64) return null;
  const match = logoBase64.match(/^data:image\/(png|jpeg|jpg|gif);base64,(.+)$/);
  if (!match) return null;
  const ext = match[1] === "jpg" ? "jpeg" : (match[1] as "png" | "jpeg" | "gif");
  return { base64: match[2], extension: ext };
}

/** Every sheet starts fully locked; individual editable cells are unlocked explicitly — safer default than remembering to lock formula cells one by one. */
function lockSheetByDefault(ws: ExcelJS.Worksheet) {
  ws.properties.defaultRowHeight = 18;
}

function styleHeaderRow(row: ExcelJS.Row, fillArgb: string) {
  row.eachCell((cell) => {
    cell.font = { name: FONT_NAME, size: FONT_SIZE, bold: true, color: { argb: contrastText(fillArgb) } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillArgb } };
    cell.border = {
      top: { style: "thin", color: { argb: "FFB0B0B0" } },
      bottom: { style: "thin", color: { argb: "FFB0B0B0" } },
      left: { style: "thin", color: { argb: "FFB0B0B0" } },
      right: { style: "thin", color: { argb: "FFB0B0B0" } },
    };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.protection = { locked: true };
  });
}

function editableCell(cell: ExcelJS.Cell) {
  cell.protection = { locked: false };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: WHITE } };
  cell.font = { name: FONT_NAME, size: FONT_SIZE };
  cell.border = {
    top: { style: "thin", color: { argb: "FFDDDDDD" } },
    bottom: { style: "thin", color: { argb: "FFDDDDDD" } },
    left: { style: "thin", color: { argb: "FFDDDDDD" } },
    right: { style: "thin", color: { argb: "FFDDDDDD" } },
  };
}

function lockedFormulaCell(cell: ExcelJS.Cell) {
  cell.protection = { locked: true };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: GRAY_LOCKED } };
  cell.font = { name: FONT_NAME, size: FONT_SIZE, color: { argb: "FF555555" } };
  cell.border = {
    top: { style: "thin", color: { argb: "FFDDDDDD" } },
    bottom: { style: "thin", color: { argb: "FFDDDDDD" } },
    left: { style: "thin", color: { argb: "FFDDDDDD" } },
    right: { style: "thin", color: { argb: "FFDDDDDD" } },
  };
}

async function protectSheet(ws: ExcelJS.Worksheet) {
  // Empty password: this is meant to stop accidental overtyping of formula
  // cells, not to be real access control — Excel's sheet protection was
  // never meant for that, and this product has no accounts to tie a real
  // password to.
  await ws.protect("", {
    selectLockedCells: true,
    selectUnlockedCells: true,
    formatCells: false,
    formatColumns: false,
    formatRows: false,
    insertRows: false,
    insertColumns: false,
    deleteRows: false,
    deleteColumns: false,
    sort: false,
    autoFilter: true,
  });
}

const MAX_LOG_ROWS = 200; // Benta Log / Gastos Log capacity — generous headroom for a small sari-sari store's daily entries.

export async function generateNegosyoExcel(data: NegosyoTrackerData): Promise<Buffer> {
  const businessName = data.businessName.trim().slice(0, 80) || "Aking Negosyo";
  const products = data.products.map((p) => p.trim()).filter(Boolean).slice(0, 20);
  const color1 = toArgb(data.color1, "#00FF88");
  const color2 = toArgb(data.color2, "#0B0F1A");
  const logo = parseLogo(data.logoBase64);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Axla — Negosyo Tracker";
  workbook.created = new Date();

  let logoImageId: number | null = null;
  if (logo) {
    logoImageId = workbook.addImage({ base64: logo.base64, extension: logo.extension });
  }

  // ---------- Sheet 1: Cover ----------
  const cover = workbook.addWorksheet("Cover", { properties: { tabColor: { argb: color1 } } });
  lockSheetByDefault(cover);
  cover.columns = [{ width: 4 }, { width: 30 }, { width: 30 }, { width: 30 }, { width: 4 }];

  if (logoImageId !== null) {
    cover.addImage(logoImageId, { tl: { col: 1, row: 1 }, ext: { width: 90, height: 90 } });
  }

  cover.mergeCells("B6:D6");
  const nameCell = cover.getCell("B6");
  nameCell.value = businessName;
  nameCell.font = { name: FONT_NAME, size: 28, bold: true, color: { argb: color1 } };
  nameCell.alignment = { horizontal: "left", vertical: "middle" };

  cover.mergeCells("B7:D7");
  const catCell = cover.getCell("B7");
  catCell.value = `Kategorya: ${data.category}`;
  catCell.font = { name: FONT_NAME, size: 13, color: { argb: "FF555555" } };

  cover.mergeCells("B8:D8");
  const taglineCell = cover.getCell("B8");
  taglineCell.value = "Sales, Tubo & Inventory Tracker — Powered by Axla";
  taglineCell.font = { name: FONT_NAME, size: 11, italic: true, color: { argb: "FF888888" } };

  const howToStart = 11;
  cover.mergeCells(`B${howToStart}:D${howToStart}`);
  const howToTitle = cover.getCell(`B${howToStart}`);
  howToTitle.value = "Paano Gamitin";
  howToTitle.font = { name: FONT_NAME, size: 16, bold: true, color: { argb: color2 } };

  const instructions = [
    "1. Punan ang PUTI (white) na cells — yan lang ang pwede mong palitan.",
    "2. Ang GRAY na cells ay may formula na — huwag hawakan para hindi masira ang computation.",
    "3. Price List: ilagay ang Puhunan at Benta price ng bawat produkto — awtomatikong makukuha ang Tubo at Margin.",
    "4. Benta Log: pumili ng Produkto sa dropdown, ilagay ang Qty — awtomatikong makukuha ang Total.",
    "5. Gastos Log: ilagay ang mga gastos araw-araw (renta, ilaw, load, etc.).",
    "6. Inventory: awtomatikong babawas ang stock base sa Benta Log.",
    data.mayUtang
      ? "7. Utang List: ilagay kung sino may utang — awtomatikong makukuha ang petsa at halaga mula sa Benta Log."
      : "7. Walang Utang List na ginamit para sa negosyong ito.",
    "8. Buwanang Report: makikita dito ang kabuuang benta, tubo, at top product bawat buwan — print-ready pa!",
  ];
  instructions.forEach((line, i) => {
    cover.mergeCells(`B${howToStart + 2 + i}:D${howToStart + 2 + i}`);
    const cell = cover.getCell(`B${howToStart + 2 + i}`);
    cell.value = line;
    cell.font = { name: FONT_NAME, size: 11 };
    cell.alignment = { wrapText: true, vertical: "top" };
  });

  const legendRow = howToStart + 2 + instructions.length + 2;
  const whiteLegend = cover.getCell(`B${legendRow}`);
  whiteLegend.value = "  Puti = pwede mong i-type";
  editableCell(whiteLegend);
  const grayLegend = cover.getCell(`C${legendRow}`);
  grayLegend.value = "  Gray = may formula, wag hawakan";
  lockedFormulaCell(grayLegend);
  await protectSheet(cover);

  // ---------- Sheet 3: Price List (built before Dashboard so Dashboard/Benta Log can reference it) ----------
  const priceList = workbook.addWorksheet("Price List", { properties: { tabColor: { argb: color1 } } });
  lockSheetByDefault(priceList);
  priceList.columns = [
    { header: "Produkto", key: "product", width: 24 },
    { header: "Puhunan", key: "cost", width: 14 },
    { header: "Benta Price", key: "price", width: 14 },
    { header: "Tubo (Auto)", key: "profit", width: 14 },
    { header: "Margin % (Auto)", key: "margin", width: 16 },
  ];
  styleHeaderRow(priceList.getRow(1), color1);
  priceList.getRow(1).height = 24;

  const productRows = products.length > 0 ? products : ["Produkto 1", "Produkto 2", "Produkto 3"];
  productRows.forEach((product, idx) => {
    const r = idx + 2;
    const productCell = priceList.getCell(`A${r}`);
    productCell.value = product;
    editableCell(productCell);

    const costCell = priceList.getCell(`B${r}`);
    editableCell(costCell);
    costCell.numFmt = '"₱"#,##0.00';

    const priceCell = priceList.getCell(`C${r}`);
    editableCell(priceCell);
    priceCell.numFmt = '"₱"#,##0.00';

    const profitCell = priceList.getCell(`D${r}`);
    profitCell.value = { formula: `IF(AND(B${r}="",C${r}=""),"",C${r}-B${r})`, result: 0 };
    lockedFormulaCell(profitCell);
    profitCell.numFmt = '"₱"#,##0.00';

    const marginCell = priceList.getCell(`E${r}`);
    marginCell.value = { formula: `IF(OR(C${r}="",C${r}=0),"",D${r}/C${r}*100)`, result: 0 };
    lockedFormulaCell(marginCell);
    marginCell.numFmt = '0.0"%"';
  });
  const priceListLastRow = productRows.length + 1;

  priceList.addConditionalFormatting({
    ref: `D2:E${priceListLastRow}`,
    rules: [
      {
        type: "cellIs",
        operator: "lessThan",
        formulae: [0],
        priority: 1,
        style: { font: { color: { argb: RED_TEXT }, bold: true } },
      },
    ],
  });
  await protectSheet(priceList);

  // ---------- Sheet 4: Benta Log ----------
  const bentaLog = workbook.addWorksheet("Benta Log", { properties: { tabColor: { argb: color1 } } });
  lockSheetByDefault(bentaLog);
  bentaLog.columns = [
    { header: "Petsa", key: "date", width: 14 },
    { header: "Produkto", key: "product", width: 22 },
    { header: "Qty", key: "qty", width: 10 },
    { header: "Total (Auto)", key: "total", width: 14 },
    { header: "Bayad", key: "bayad", width: 14 },
  ];
  styleHeaderRow(bentaLog.getRow(1), color1);
  bentaLog.getRow(1).height = 24;

  for (let r = 2; r <= MAX_LOG_ROWS + 1; r++) {
    const dateCell = bentaLog.getCell(`A${r}`);
    editableCell(dateCell);
    dateCell.numFmt = "mm/dd/yyyy";

    const productCell = bentaLog.getCell(`B${r}`);
    editableCell(productCell);
    productCell.dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [`'Price List'!$A$2:$A$${priceListLastRow}`],
      showErrorMessage: true,
      errorTitle: "Invalid product",
      error: "Pumili ng produkto mula sa Price List.",
    };

    const qtyCell = bentaLog.getCell(`C${r}`);
    editableCell(qtyCell);

    const totalCell = bentaLog.getCell(`D${r}`);
    totalCell.value = {
      formula: `IF(OR(B${r}="",C${r}=""),"",C${r}*IFERROR(VLOOKUP(B${r},'Price List'!$A:$C,3,FALSE),0))`,
      result: 0,
    };
    lockedFormulaCell(totalCell);
    totalCell.numFmt = '"₱"#,##0.00';

    const bayadCell = bentaLog.getCell(`E${r}`);
    editableCell(bayadCell);
    bayadCell.dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: ['"Cash,GCash,Utang"'],
      showErrorMessage: true,
    };
  }

  const bentaTotalRow = MAX_LOG_ROWS + 2;
  bentaLog.mergeCells(`A${bentaTotalRow}:C${bentaTotalRow}`);
  const bentaTotalLabel = bentaLog.getCell(`A${bentaTotalRow}`);
  bentaTotalLabel.value = "TOTAL BENTA";
  bentaTotalLabel.font = { name: FONT_NAME, size: 12, bold: true };
  const bentaTotalCell = bentaLog.getCell(`D${bentaTotalRow}`);
  bentaTotalCell.value = { formula: `SUM(D2:D${MAX_LOG_ROWS + 1})`, result: 0 };
  bentaTotalCell.font = { name: FONT_NAME, size: 12, bold: true };
  bentaTotalCell.numFmt = '"₱"#,##0.00';
  bentaTotalCell.protection = { locked: true };
  await protectSheet(bentaLog);

  // ---------- Sheet 5: Gastos Log ----------
  const gastosLog = workbook.addWorksheet("Gastos Log", { properties: { tabColor: { argb: color1 } } });
  lockSheetByDefault(gastosLog);
  gastosLog.columns = [
    { header: "Petsa", key: "date", width: 14 },
    { header: "Ano (Gastos)", key: "what", width: 26 },
    { header: "Amount", key: "amount", width: 16 },
  ];
  styleHeaderRow(gastosLog.getRow(1), color1);
  gastosLog.getRow(1).height = 24;

  for (let r = 2; r <= MAX_LOG_ROWS + 1; r++) {
    const dateCell = gastosLog.getCell(`A${r}`);
    editableCell(dateCell);
    dateCell.numFmt = "mm/dd/yyyy";
    const whatCell = gastosLog.getCell(`B${r}`);
    editableCell(whatCell);
    const amountCell = gastosLog.getCell(`C${r}`);
    editableCell(amountCell);
    amountCell.numFmt = '"₱"#,##0.00';
  }

  const gastosTotalRow = MAX_LOG_ROWS + 2;
  gastosLog.mergeCells(`A${gastosTotalRow}:B${gastosTotalRow}`);
  const gastosTotalLabel = gastosLog.getCell(`A${gastosTotalRow}`);
  gastosTotalLabel.value = "TOTAL GASTOS";
  gastosTotalLabel.font = { name: FONT_NAME, size: 12, bold: true };
  const gastosTotalCell = gastosLog.getCell(`C${gastosTotalRow}`);
  gastosTotalCell.value = { formula: `SUM(C2:C${MAX_LOG_ROWS + 1})`, result: 0 };
  gastosTotalCell.font = { name: FONT_NAME, size: 12, bold: true };
  gastosTotalCell.numFmt = '"₱"#,##0.00';
  gastosTotalCell.protection = { locked: true };
  await protectSheet(gastosLog);

  // ---------- Sheet 6: Inventory ----------
  const inventory = workbook.addWorksheet("Inventory", { properties: { tabColor: { argb: color1 } } });
  lockSheetByDefault(inventory);
  inventory.columns = [
    { header: "Produkto", key: "product", width: 24 },
    { header: "Starting Stock", key: "stock", width: 16 },
    { header: "Auto Bawas (Natitira)", key: "remaining", width: 20 },
    { header: "Status", key: "status", width: 16 },
  ];
  styleHeaderRow(inventory.getRow(1), color1);
  inventory.getRow(1).height = 24;

  productRows.forEach((product, idx) => {
    const r = idx + 2;
    const productCell = inventory.getCell(`A${r}`);
    productCell.value = product;
    editableCell(productCell);

    const stockCell = inventory.getCell(`B${r}`);
    stockCell.value = 100;
    editableCell(stockCell);

    const remainingCell = inventory.getCell(`C${r}`);
    remainingCell.value = {
      formula: `B${r}-SUMIF('Benta Log'!$B$2:$B$${MAX_LOG_ROWS + 1},A${r},'Benta Log'!$C$2:$C$${MAX_LOG_ROWS + 1})`,
      result: 0,
    };
    lockedFormulaCell(remainingCell);

    const statusCell = inventory.getCell(`D${r}`);
    statusCell.value = {
      formula: `IF(C${r}<=0,"❌ Ubos",IF(C${r}<=10,"⚠️ Paubos","✅ OK"))`,
      result: "✅ OK",
    };
    statusCell.protection = { locked: true };
    statusCell.font = { name: FONT_NAME, size: FONT_SIZE, bold: true };
    statusCell.alignment = { horizontal: "center" };
  });
  const inventoryLastRow = productRows.length + 1;

  inventory.addConditionalFormatting({
    ref: `D2:D${inventoryLastRow}`,
    rules: [
      // Matched on the emoji rather than "Ubos"/"Paubos" text — "Paubos"
      // contains "ubos" as a substring, which would make a text-based
      // "Ubos" match also fire (wrongly) on "⚠️ Paubos" rows.
      { type: "containsText", operator: "containsText", text: "❌", priority: 1, style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: RED_FILL } } } },
      { type: "containsText", operator: "containsText", text: "⚠️", priority: 2, style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: YELLOW_FILL } } } },
      { type: "containsText", operator: "containsText", text: "✅", priority: 3, style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: GREEN_FILL } } } },
    ],
  });
  await protectSheet(inventory);

  // ---------- Sheet 2: Dashboard (built after Price List/Benta Log/Gastos Log/Inventory so formulas can reference them) ----------
  const dashboard = workbook.addWorksheet("Dashboard", { properties: { tabColor: { argb: color1 } } });
  lockSheetByDefault(dashboard);
  dashboard.columns = [{ width: 4 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 20 }, { width: 4 }];

  dashboard.mergeCells("B2:E2");
  const dashTitle = dashboard.getCell("B2");
  dashTitle.value = `Dashboard — ${businessName}`;
  dashTitle.font = { name: FONT_NAME, size: 18, bold: true, color: { argb: color2 } };

  dashboard.getCell("B4").value = "Tingnan:";
  dashboard.getCell("B4").font = { name: FONT_NAME, size: 11, bold: true };
  const periodCell = dashboard.getCell("C4");
  periodCell.value = "Daily";
  editableCell(periodCell);
  periodCell.dataValidation = {
    type: "list",
    allowBlank: false,
    formulae: ['"Daily,Weekly,Monthly"'],
    showErrorMessage: true,
  };

  const dateRangeFormula =
    `IF($C$4="Daily",TODAY(),IF($C$4="Weekly",TODAY()-WEEKDAY(TODAY(),2)+1,EOMONTH(TODAY(),-1)+1))`;

  const tileDefs = [
    { label: "Benta", color: color1, formula: `SUMIFS('Benta Log'!$D$2:$D$${MAX_LOG_ROWS + 1},'Benta Log'!$A$2:$A$${MAX_LOG_ROWS + 1},">="&${dateRangeFormula})`, fmt: '"₱"#,##0.00' },
    { label: "Gastos", color: "FFE07A5F", formula: `SUMIFS('Gastos Log'!$C$2:$C$${MAX_LOG_ROWS + 1},'Gastos Log'!$A$2:$A$${MAX_LOG_ROWS + 1},">="&${dateRangeFormula})`, fmt: '"₱"#,##0.00' },
    { label: "Tubo", color: color2, formula: `B7-C7`, fmt: '"₱"#,##0.00' },
    // Matched on the emoji, not the word "Ubos" — "Paubos" contains "ubos"
    // as a substring, so a "*Ubos*" wildcard would double-count it here too.
    { label: "Paubos", color: "FFCC8400", formula: `COUNTIF(Inventory!$D$2:$D$${inventoryLastRow},"*⚠️*")+COUNTIF(Inventory!$D$2:$D$${inventoryLastRow},"*❌*")`, fmt: "0" },
  ];

  const tileLabelRow = 6;
  const tileValueRow = 7;
  tileDefs.forEach((tile, i) => {
    const col = String.fromCharCode("B".charCodeAt(0) + i);
    const labelCell = dashboard.getCell(`${col}${tileLabelRow}`);
    labelCell.value = tile.label;
    labelCell.font = { name: FONT_NAME, size: 12, bold: true, color: { argb: contrastText(toArgb(tile.color, "#00FF88")) } };
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: toArgb(tile.color, "#00FF88") } };
    labelCell.alignment = { horizontal: "center" };

    const valueCell = dashboard.getCell(`${col}${tileValueRow}`);
    valueCell.value = { formula: tile.formula, result: 0 };
    valueCell.numFmt = tile.fmt;
    valueCell.font = { name: FONT_NAME, size: 16, bold: true };
    valueCell.alignment = { horizontal: "center" };
    valueCell.protection = { locked: true };
    valueCell.border = { bottom: { style: "medium", color: { argb: toArgb(tile.color, "#00FF88") } } };
  });

  // "2 charts" — exceljs has no native Excel chart API, so these are real,
  // formula-driven data-bar tables (Excel's own in-cell bar visualization)
  // rather than a fabricated claim of full chart objects.
  const trendStart = 10;
  dashboard.getCell(`B${trendStart}`).value = "Benta — Huling 7 Araw";
  dashboard.getCell(`B${trendStart}`).font = { name: FONT_NAME, size: 12, bold: true };
  for (let i = 0; i < 7; i++) {
    const r = trendStart + 1 + i;
    const dayLabel = dashboard.getCell(`B${r}`);
    dayLabel.value = { formula: `TEXT(TODAY()-${6 - i},"mmm d")`, result: "" };
    dayLabel.font = { name: FONT_NAME, size: 10 };
    const dayValue = dashboard.getCell(`C${r}`);
    dayValue.value = {
      formula: `SUMIFS('Benta Log'!$D$2:$D$${MAX_LOG_ROWS + 1},'Benta Log'!$A$2:$A$${MAX_LOG_ROWS + 1},TODAY()-${6 - i})`,
      result: 0,
    };
    dayValue.numFmt = '"₱"#,##0';
    dayValue.protection = { locked: true };
  }
  dashboard.addConditionalFormatting({
    ref: `C${trendStart + 1}:C${trendStart + 7}`,
    rules: [{ type: "dataBar", gradient: true, minLength: 0, maxLength: 100, color: { argb: color1 }, cfvo: [{ type: "min" }, { type: "max" }], priority: 4 } as DataBarRuleWithColor],
  });

  const gastosTrendStart = trendStart;
  dashboard.getCell(`E${gastosTrendStart}`).value = "Gastos — Huling 7 Araw";
  dashboard.getCell(`E${gastosTrendStart}`).font = { name: FONT_NAME, size: 12, bold: true };
  for (let i = 0; i < 7; i++) {
    const r = gastosTrendStart + 1 + i;
    const dayValue = dashboard.getCell(`E${r}`);
    dayValue.value = {
      formula: `SUMIFS('Gastos Log'!$C$2:$C$${MAX_LOG_ROWS + 1},'Gastos Log'!$A$2:$A$${MAX_LOG_ROWS + 1},TODAY()-${6 - i})`,
      result: 0,
    };
    dayValue.numFmt = '"₱"#,##0';
    dayValue.protection = { locked: true };
  }
  dashboard.addConditionalFormatting({
    ref: `E${gastosTrendStart + 1}:E${gastosTrendStart + 7}`,
    rules: [{ type: "dataBar", gradient: true, minLength: 0, maxLength: 100, color: { argb: "FFE07A5F" }, cfvo: [{ type: "min" }, { type: "max" }], priority: 5 } as DataBarRuleWithColor],
  });

  const alertRow = trendStart + 9;
  dashboard.mergeCells(`B${alertRow}:E${alertRow}`);
  const alertCell = dashboard.getCell(`B${alertRow}`);
  alertCell.value = {
    formula: `IF(E7=0,"✅ Walang paubos na paninda ngayon.","⚠️ May "&E7&" produktong paubos na — check Inventory sheet.")`,
    result: "",
  };
  alertCell.font = { name: FONT_NAME, size: 11, bold: true };
  alertCell.protection = { locked: true };
  await protectSheet(dashboard);

  // ---------- Sheet 7: Utang List ----------
  const utangList = workbook.addWorksheet("Utang List", { properties: { tabColor: { argb: color1 } } });
  lockSheetByDefault(utangList);
  if (data.mayUtang) {
    utangList.columns = [
      { header: "Sino", key: "who", width: 22 },
      { header: "Kelan (Auto)", key: "date", width: 16 },
      { header: "Magkano (Auto)", key: "amount", width: 16 },
      { header: "Status", key: "status", width: 16 },
    ];
    styleHeaderRow(utangList.getRow(1), color1);
    utangList.getRow(1).height = 24;

    utangList.mergeCells("A2:D2");
    const noteCell = utangList.getCell("A2");
    noteCell.value =
      "Note: Kelan/Magkano auto mula sa Benta Log na 'Utang' ang bayad. Sino at Status manual — walang customer name field ang Benta Log.";
    noteCell.font = { name: FONT_NAME, size: 9, italic: true, color: { argb: "FF888888" } };
    noteCell.alignment = { wrapText: true };
    utangList.getRow(2).height = 28;

    // Compacts Benta Log's scattered "Utang" rows into a dense list (rather
    // than mirroring every Benta Log row 1:1, which would leave this sheet
    // mostly blank) using AGGREGATE(15,6,...) — Excel's "ignore errors while
    // taking the k-th smallest" function. This is a plain formula, not a
    // macro or an array formula needing Ctrl+Shift+Enter: the division
    // deliberately produces #DIV/0! on non-Utang rows, which option 6 skips.
    const utangStart = 4;
    for (let i = 0; i < MAX_LOG_ROWS; i++) {
      const r = utangStart + i;
      const k = `ROWS($A$${utangStart}:A${r})`;
      const relativeRowFormula = `AGGREGATE(15,6,(ROW('Benta Log'!$E$2:$E$${MAX_LOG_ROWS + 1})-ROW('Benta Log'!$E$2)+1)/('Benta Log'!$E$2:$E$${MAX_LOG_ROWS + 1}="Utang"),${k})`;

      const whoCell = utangList.getCell(`A${r}`);
      editableCell(whoCell);

      const dateCell = utangList.getCell(`B${r}`);
      dateCell.value = {
        formula: `IFERROR(INDEX('Benta Log'!$A$2:$A$${MAX_LOG_ROWS + 1},${relativeRowFormula}),"")`,
        result: "",
      };
      lockedFormulaCell(dateCell);
      dateCell.numFmt = "mm/dd/yyyy";

      const amountCell = utangList.getCell(`C${r}`);
      amountCell.value = {
        formula: `IFERROR(INDEX('Benta Log'!$D$2:$D$${MAX_LOG_ROWS + 1},${relativeRowFormula}),"")`,
        result: "",
      };
      lockedFormulaCell(amountCell);
      amountCell.numFmt = '"₱"#,##0.00';

      const statusCell = utangList.getCell(`D${r}`);
      editableCell(statusCell);
      statusCell.dataValidation = {
        type: "list",
        allowBlank: true,
        formulae: ['"Naka-utang,Nabayaran na"'],
        showErrorMessage: true,
      };
    }
    await protectSheet(utangList);
  } else {
    utangList.mergeCells("A1:D1");
    const offCell = utangList.getCell("A1");
    offCell.value = "Naka-off ang Utang tracking para sa negosyong ito (walang utang na binebenta).";
    offCell.font = { name: FONT_NAME, size: 12, italic: true, color: { argb: "FF888888" } };
    utangList.columns = [{ width: 60 }];
  }

  // ---------- Sheet 8: Buwanang Report ----------
  const report = workbook.addWorksheet("Buwanang Report", { properties: { tabColor: { argb: color1 } } });
  lockSheetByDefault(report);
  report.columns = [{ width: 4 }, { width: 26 }, { width: 26 }, { width: 4 }];
  report.pageSetup = { orientation: "portrait", fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.5, right: 0.5, top: 0.6, bottom: 0.6, header: 0.3, footer: 0.3 } };

  if (logoImageId !== null) {
    report.addImage(logoImageId, { tl: { col: 1, row: 1 }, ext: { width: 60, height: 60 } });
  }

  report.mergeCells("B4:C4");
  const reportTitle = report.getCell("B4");
  reportTitle.value = businessName;
  reportTitle.font = { name: FONT_NAME, size: 20, bold: true, color: { argb: color1 } };

  report.mergeCells("B5:C5");
  const reportSubtitle = report.getCell("B5");
  reportSubtitle.value = { formula: `"Buwanang Report — "&TEXT(TODAY(),"mmmm yyyy")`, result: "" };
  reportSubtitle.font = { name: FONT_NAME, size: 12, color: { argb: "FF555555" } };

  const reportRows: Array<{ label: string; formula: string; fmt?: string }> = [
    { label: "Total Benta (Buwan)", formula: `SUMIFS('Benta Log'!$D$2:$D$${MAX_LOG_ROWS + 1},'Benta Log'!$A$2:$A$${MAX_LOG_ROWS + 1},">="&EOMONTH(TODAY(),-1)+1,'Benta Log'!$A$2:$A$${MAX_LOG_ROWS + 1},"<="&EOMONTH(TODAY(),0))`, fmt: '"₱"#,##0.00' },
    { label: "Total Gastos (Buwan)", formula: `SUMIFS('Gastos Log'!$C$2:$C$${MAX_LOG_ROWS + 1},'Gastos Log'!$A$2:$A$${MAX_LOG_ROWS + 1},">="&EOMONTH(TODAY(),-1)+1,'Gastos Log'!$A$2:$A$${MAX_LOG_ROWS + 1},"<="&EOMONTH(TODAY(),0))`, fmt: '"₱"#,##0.00' },
    { label: "Tubo ng Buwan", formula: `B8-B9`, fmt: '"₱"#,##0.00' },
    {
      label: "Top Product",
      formula: `IFERROR(INDEX('Price List'!$A$2:$A$${priceListLastRow},MATCH(MAX(SUMIF('Benta Log'!$B$2:$B$${MAX_LOG_ROWS + 1},'Price List'!$A$2:$A$${priceListLastRow},'Benta Log'!$D$2:$D$${MAX_LOG_ROWS + 1})),SUMIF('Benta Log'!$B$2:$B$${MAX_LOG_ROWS + 1},'Price List'!$A$2:$A$${priceListLastRow},'Benta Log'!$D$2:$D$${MAX_LOG_ROWS + 1}),0)),"—")`,
    },
  ];
  const reportStart = 8;
  reportRows.forEach((row, i) => {
    const r = reportStart + i;
    const labelCell = report.getCell(`B${r}`);
    labelCell.value = row.label;
    labelCell.font = { name: FONT_NAME, size: 12, bold: true };
    const valueCell = report.getCell(`C${r}`);
    valueCell.value = { formula: row.formula, result: row.fmt ? 0 : "—" };
    if (row.fmt) valueCell.numFmt = row.fmt;
    valueCell.font = { name: FONT_NAME, size: 12, color: { argb: color2 } };
    valueCell.protection = { locked: true };
  });

  const footerRow = reportStart + reportRows.length + 2;
  report.mergeCells(`B${footerRow}:C${footerRow}`);
  const footerCell = report.getCell(`B${footerRow}`);
  footerCell.value = "Generated by Axla Negosyo Tracker";
  footerCell.font = { name: FONT_NAME, size: 9, italic: true, color: { argb: "FFAAAAAA" } };
  await protectSheet(report);

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}
