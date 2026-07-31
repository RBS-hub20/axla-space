import "server-only";
import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";

/**
 * exceljs's own DataBarRuleType type declaration omits `color`, but its
 * runtime XML writer (lib/xlsx/xform/sheet/cf/databar-xform.js) reads
 * `model.color` directly and renders it — a real gap between the published
 * .d.ts and the actual implementation, not a typo here.
 */
type DataBarRuleWithColor = ExcelJS.DataBarRuleType & { color: { argb: string } };

/** A single-color data-bar CF rule — exceljs has no native chart API, so this is the "chart" substitute used across every Dashboard's 7-day trend. */
export function dataBarRule(colorHex: string, priority = 1): DataBarRuleWithColor {
  return {
    type: "dataBar",
    gradient: true,
    minLength: 0,
    maxLength: 100,
    color: { argb: `FF${colorHex.replace("#", "").toUpperCase()}` },
    cfvo: [{ type: "min" }, { type: "max" }],
    priority,
  };
}

/**
 * Colors, fonts and row/column conventions below are lifted directly from
 * the reference workbooks the user supplied (SariSari_Store_System,
 * NegosyoTracker_Airbnb/Barbershop/CarWash/Pandesal/Rental) — not invented.
 * Every real reference sheet follows the same shape: logo in column A,
 * title merged B1:lastCol (navy #0D1A36, white bold ~18-20pt), tagline
 * merged B2:lastCol (dark navy #14264D, gold #F5B21E italic bold), then a
 * header row with each column individually colored from this palette,
 * alternating F5F7FA/FFFFFF data rows, and IF(A{r}="","",...) guarded
 * formulas so blank template rows never show #VALUE!/0.
 */
export const PALETTE = {
  navyDark: "0D1A36",
  navy: "14264D",
  blue: "1E5AC8",
  blueLight: "0277BD",
  teal: "00897B",
  green: "2E8B47",
  greenDark: "1C6430",
  gold: "F5B21E",
  red: "A11A1A",
  redLight: "E05A47",
  purple: "5E35B1",
  brown: "8D5524",
  brownLight: "A1733B",
  rowAlt: "F5F7FA",
  rowWhite: "FFFFFF",
  taglineBg: "FFFDF0",
  inputBg: "C8E6C9",
  textDark: "1C2230",
  textMuted: "555555",
};

export const FONT_NAME = "Calibri";

function argb(hex: string): string {
  return `FF${hex.replace("#", "").toUpperCase()}`;
}

let cachedLogoBase64: string | null = null;
function loadLogoBase64(): string | null {
  if (cachedLogoBase64 !== null) return cachedLogoBase64;
  try {
    const buf = fs.readFileSync(path.join(process.cwd(), "public", "negosyo-tracker-logo.png"));
    cachedLogoBase64 = buf.toString("base64");
  } catch {
    cachedLogoBase64 = "";
  }
  return cachedLogoBase64 || null;
}

/** Registers the fixed Negosyo Tracker PH logo once per workbook; every sheet reuses the same imageId. */
export function registerLogo(workbook: ExcelJS.Workbook): number | null {
  const base64 = loadLogoBase64();
  if (!base64) return null;
  return workbook.addImage({ base64, extension: "png" });
}

/** Fixed pixel size for the logo embedded via embedLogo() — writeHeaderBar() sizes column A / row 1 around this exact value, so keep them in sync if this ever changes. */
export const LOGO_SIZE_PX = 68;

/**
 * Column A on every sheet is reserved for the logo. Anchored as a fixed
 * 68x68px floating image at A1 — exceljs's one-cell anchor doesn't resize
 * with the cell, so the CONTAINER (column A's width, row 1's height) has to
 * be sized to comfortably fit this exact pixel size or the image spills
 * over into the title text in column B / the tagline in row 2. That sizing
 * lives in writeHeaderBar() below, not here, since embedLogo() is always
 * called before writeHeaderBar() in every sheet-building function — if the
 * row/column sizing were set here instead, writeHeaderBar()'s own
 * (previously unconditional) row-1-height write would immediately
 * overwrite it back down.
 */
export function embedLogo(ws: ExcelJS.Worksheet, logoImageId: number | null) {
  if (logoImageId === null) return;
  ws.addImage(logoImageId, { tl: { col: 0, row: 0 }, ext: { width: LOGO_SIZE_PX, height: LOGO_SIZE_PX } });
}

export interface HeaderBarOptions {
  ws: ExcelJS.Worksheet;
  lastCol: number; // 1-based index of the last column to merge across (e.g. 8 for column H)
  titleText: string;
  taglineText: string;
  titleFill?: string; // defaults to navyDark
  titleSize?: number;
}

/** The universal "row 1 = big title, row 2 = tagline" bar every real sheet opens with. */
export function writeHeaderBar(opts: HeaderBarOptions) {
  const { ws, lastCol, titleText, taglineText, titleFill = PALETTE.navyDark, titleSize = 18 } = opts;
  const lastColLetter = ws.getColumn(lastCol).letter;

  // Column A width in Excel's character-width units converts to pixels as
  // roughly (width*7)+5, and row height in points converts to pixels as
  // roughly height*1.333 — 11 and 62 both land comfortably above
  // LOGO_SIZE_PX (68px), leaving ~14px of real margin on the right/bottom
  // of the logo rather than the previous width=4/height=26 (~33x35px),
  // which was smaller than the logo itself and caused it to spill over the
  // title text. This must be set here, not in embedLogo(), since embedLogo()
  // always runs first and this line used to unconditionally reset row 1
  // back down to 26 afterward regardless of what embedLogo() had done.
  ws.getColumn(1).width = 11;
  ws.getRow(1).height = 62;

  ws.mergeCells(`B1:${lastColLetter}1`);
  const titleCell = ws.getCell("B1");
  titleCell.value = titleText;
  titleCell.font = { name: FONT_NAME, size: titleSize, bold: true, color: { argb: argb("FFFFFF") } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(titleFill) } };
  titleCell.alignment = { vertical: "middle" };

  ws.mergeCells(`B2:${lastColLetter}2`);
  const taglineCell = ws.getCell("B2");
  taglineCell.value = taglineText;
  taglineCell.font = { name: FONT_NAME, size: 10, bold: true, italic: true, color: { argb: argb(PALETTE.gold) } };
  taglineCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.navy) } };
  taglineCell.alignment = { vertical: "middle" };
}

/** Section bar used mid-sheet, e.g. "TODAY AT A GLANCE" / "LAST 7 DAYS" / "MONTH TOTALS". */
export function writeSectionBar(ws: ExcelJS.Worksheet, row: number, fromCol: number, toCol: number, text: string, fill = PALETTE.green) {
  const fromLetter = ws.getColumn(fromCol).letter;
  const toLetter = ws.getColumn(toCol).letter;
  ws.mergeCells(`${fromLetter}${row}:${toLetter}${row}`);
  const cell = ws.getCell(`${fromLetter}${row}`);
  cell.value = text;
  cell.font = { name: FONT_NAME, size: 12, bold: true, color: { argb: argb("FFFFFF") } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(fill) } };
  cell.alignment = { vertical: "middle" };
}

export interface ColumnSpec {
  header: string;
  headerFill: string;
  width?: number;
  numFmt?: string;
  /** true = white/editable input cell (user types data). false = gray/locked, only ever set by formula. */
  editable: boolean;
  /** Formula for data rows, given the row number. Omit for plain editable columns. */
  formula?: (r: number) => string;
  dataValidation?: (r: number) => ExcelJS.DataValidation;
  seedFormula?: (r: number) => string; // only used for the very first data row when a formula must exist before user input
  /** Pre-fills the first N editable rows with the customer's real data (e.g. their actual product names) — never fake/demo values. */
  seedValues?: (string | number)[];
}

export interface LedgerSheetSpec {
  name: string;
  tabColor: string;
  sheetTitle: string;
  sheetTagline: string;
  columns: ColumnSpec[];
  dataRowCount: number;
  headerRowFontSize?: number;
  /** Extra info block written above the header row (e.g. "TOTAL STOCK VALUE" box) — receives the last data row number for SUM ranges. */
  extraHeaderBlock?: (ws: ExcelJS.Worksheet, lastDataRow: number) => void;
}

function styleDataCell(cell: ExcelJS.Cell, editable: boolean, rowIsAlt: boolean) {
  cell.font = { name: FONT_NAME, size: 10, color: editable ? undefined : { argb: argb(PALETTE.textMuted) } };
  cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(rowIsAlt ? PALETTE.rowAlt : PALETTE.rowWhite) } };
  cell.protection = { locked: !editable };
  cell.border = {
    top: { style: "thin", color: { argb: argb("DDDDDD") } },
    bottom: { style: "thin", color: { argb: argb("DDDDDD") } },
    left: { style: "thin", color: { argb: argb("DDDDDD") } },
    right: { style: "thin", color: { argb: argb("DDDDDD") } },
  };
}

/**
 * Builds a standard "ledger" sheet: logo, title/tagline bar (row 1-2), a
 * column-header row (row 3, each column individually colored per the real
 * files), then dataRowCount data rows with alternating fills and per-column
 * formulas/validations. This single builder covers the large majority of
 * sheets across every template — Inventory, Sales/Benta logs, Expenses,
 * Customers, Services, Appointments, etc. — since they all share this exact
 * shape in the reference files.
 */
export function buildLedgerSheet(
  workbook: ExcelJS.Workbook,
  logoImageId: number | null,
  spec: LedgerSheetSpec,
): ExcelJS.Worksheet {
  const ws = workbook.addWorksheet(spec.name, { properties: { tabColor: { argb: argb(spec.tabColor) } } });
  ws.views = [{ showGridLines: false }];

  const lastCol = spec.columns.length;
  ws.columns = [{ width: 4 }, ...spec.columns.map((c) => ({ width: c.width ?? 16 }))];

  embedLogo(ws, logoImageId);

  writeHeaderBar({ ws, lastCol: lastCol + 1, titleText: spec.sheetTitle, taglineText: spec.sheetTagline, titleFill: spec.tabColor, titleSize: 16 });

  const headerRow = 3;
  spec.columns.forEach((col, i) => {
    const cell = ws.getCell(headerRow, i + 2);
    cell.value = col.header;
    cell.font = { name: FONT_NAME, size: spec.headerRowFontSize ?? 9, bold: true, color: { argb: argb("FFFFFF") } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(col.headerFill) } };
    cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    cell.protection = { locked: true };
  });
  ws.getRow(headerRow).height = 26;

  const firstDataRow = headerRow + 1;
  const lastDataRow = firstDataRow + spec.dataRowCount - 1;

  for (let r = firstDataRow; r <= lastDataRow; r++) {
    const isAlt = (r - firstDataRow) % 2 === 0;
    spec.columns.forEach((col, i) => {
      const cell = ws.getCell(r, i + 2);
      const seedIdx = r - firstDataRow;
      if (col.formula) {
        cell.value = { formula: col.formula(r), result: 0 };
      } else if (col.seedFormula && r === firstDataRow) {
        cell.value = { formula: col.seedFormula(r), result: 0 };
      } else if (col.seedValues && seedIdx < col.seedValues.length) {
        cell.value = col.seedValues[seedIdx];
      }
      if (col.numFmt) cell.numFmt = col.numFmt;
      if (col.dataValidation) cell.dataValidation = col.dataValidation(r);
      styleDataCell(cell, col.editable, isAlt);
    });
  }

  if (spec.extraHeaderBlock) spec.extraHeaderBlock(ws, lastDataRow);

  return ws;
}

export const IF_BLANK = (col: string, r: number, expr: string) => `IF(${col}${r}="","",${expr})`;

/** Standard 3-way status conditional formatting (green/yellow/red) matching the real files' Inventory/Restock/Status columns. */
export function addStatusConditionalFormat(
  ws: ExcelJS.Worksheet,
  ref: string,
  rules: Array<{ text: string; fill: string }>,
) {
  ws.addConditionalFormatting({
    ref,
    rules: rules.map((rule, i) => ({
      type: "containsText",
      operator: "containsText",
      text: rule.text,
      priority: i + 1,
      style: { fill: { type: "pattern", pattern: "solid", fgColor: { argb: argb(rule.fill) } } },
    })),
  });
}

export async function protectAllSheets(workbook: ExcelJS.Workbook) {
  for (const ws of workbook.worksheets) {
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
}

export { argb };
