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

export interface RentalTemplateData {
  businessName: string;
  category: CategoryDef;
  products: string[]; // unit codes/names
  mayUtang: boolean; // unused — Rental tracks "overdue rent" instead of utang
}

const MAX_ROWS = 200;

/** Rental & Landlord Manager — reverse-engineered from NegosyoTracker_Rental_1.xlsx. All 10 real sheets, none deferred. */
export async function buildRentalWorkbook(workbook: ExcelJS.Workbook, data: RentalTemplateData) {
  const logoImageId = registerLogo(workbook);
  const units = data.products.length > 0 ? data.products : ["U-101", "U-102", "U-201"];
  const titleText = `NEGOSYO TRACKER PH — ${data.category.label}`;

  buildDashboard(workbook, logoImageId, data, titleText);
  buildUnits(workbook, logoImageId, units);
  buildTenants(workbook, logoImageId);
  buildPayments(workbook, logoImageId);
  buildInvoice(workbook, logoImageId);
  buildSOA(workbook, logoImageId);
  buildExpenses(workbook, logoImageId);
  buildMaintenance(workbook, logoImageId, units);
  buildProfitLoss(workbook, logoImageId);
  buildContract(workbook, logoImageId);
}

function buildDashboard(workbook: ExcelJS.Workbook, logoImageId: number | null, data: RentalTemplateData, titleText: string) {
  const ws = workbook.addWorksheet("1. Dashboard", { properties: { tabColor: { argb: argb(PALETTE.navy) } } });
  ws.views = [{ showGridLines: false }];
  ws.columns = [{ width: 4 }, { width: 20 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 4 }];
  embedLogo(ws, logoImageId);

  writeHeaderBar({ ws, lastCol: 10, titleText, taglineText: data.category.tagline, titleSize: 18 });

  ws.getCell("B4").value = "PROPERTY OWNER:";
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

  writeSectionBar(ws, 7, 2, 10, "TODAY AT A GLANCE", PALETTE.green);

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

  kpi(9, "B", "Monthly Rent Roll", PALETTE.green, `SUMIF('2. Units'!H:H,"Occupied",'2. Units'!F:F)`, true);
  kpi(9, "D", "Collected (This Mo)", PALETTE.blue, `SUMIFS('4. Payments'!E:E,'4. Payments'!C:C,">="&DATE(YEAR($F$4),MONTH($F$4),1),'4. Payments'!C:C,"<"&EDATE(DATE(YEAR($F$4),MONTH($F$4),1),1))`, true);
  kpi(9, "F", "Outstanding / Overdue", PALETTE.red, `SUMIF('3. Tenants'!K:K,"OVERDUE",'3. Tenants'!J:J)+SUMIF('3. Tenants'!K:K,"DUE",'3. Tenants'!J:J)`, true);
  kpi(9, "H", "Collection Rate", PALETTE.teal, `IFERROR(D9/B9,0)`);
  kpi(10, "B", "Occupied Units", PALETTE.blueLight, `COUNTIF('2. Units'!H:H,"Occupied")`);
  kpi(10, "D", "Vacant Units", PALETTE.gold, `COUNTIF('2. Units'!H:H,"Vacant")`);
  kpi(10, "F", "Leases Expiring Soon", PALETTE.redLight, `COUNTIF('3. Tenants'!N:N,"RENEW SOON")`);
  kpi(10, "H", "Open Maintenance", PALETTE.purple, `COUNTIF('8. Maintenance'!F:F,"Open")`);

  writeSectionBar(ws, 12, 2, 10, "LAST 12 MONTHS — COLLECTION", PALETTE.blue);
  ["MONTH", "BILLED", "COLLECTED"].forEach((h, i) => {
    const cell = ws.getCell(13, 2 + i);
    cell.value = h;
    cell.font = { name: FONT_NAME, size: 9, bold: true, color: { argb: argb("FFFFFF") } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.navy) } };
  });
  for (let i = 0; i < 7; i++) {
    const r = 14 + i;
    const isAlt = i % 2 === 0;
    const monthCell = ws.getCell(`B${r}`);
    monthCell.value = { formula: `TEXT(EDATE(TODAY(),-${6 - i}),"mmm yyyy")`, result: "" };
    const billedCell = ws.getCell(`C${r}`);
    billedCell.value = { formula: `SUMIF('2. Units'!H:H,"Occupied",'2. Units'!F:F)`, result: 0 };
    billedCell.numFmt = '"₱"#,##0';
    const collectedCell = ws.getCell(`D${r}`);
    collectedCell.value = {
      formula: `SUMIFS('4. Payments'!E:E,'4. Payments'!C:C,">="&EDATE(TODAY(),-${6 - i})-DAY(EDATE(TODAY(),-${6 - i}))+1,'4. Payments'!C:C,"<"&EDATE(EDATE(TODAY(),-${6 - i})-DAY(EDATE(TODAY(),-${6 - i}))+1,1))`,
      result: 0,
    };
    collectedCell.numFmt = '"₱"#,##0';
    [monthCell, billedCell, collectedCell].forEach((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(isAlt ? PALETTE.rowAlt : PALETTE.rowWhite) } };
      c.font = { name: FONT_NAME, size: 10 };
    });
  }
  ws.addConditionalFormatting({ ref: "D14:D20", rules: [dataBarRule(PALETTE.blue)] });
}

function buildUnits(workbook: ExcelJS.Workbook, logoImageId: number | null, units: string[]) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "2. Units",
    tabColor: PALETTE.navyDark,
    sheetTitle: "PROPERTIES & UNITS",
    sheetTagline: "Every unit, rate & occupancy status",
    dataRowCount: MAX_ROWS,
    columns: [
      { header: "UNIT CODE", headerFill: PALETTE.navy, editable: true, width: 11, seedValues: units },
      { header: "PROPERTY / BUILDING", headerFill: PALETTE.blue, editable: true, width: 18 },
      { header: "UNIT TYPE", headerFill: PALETTE.blueLight, editable: true, width: 12 },
      { header: "FLOOR / NO.", headerFill: PALETTE.teal, editable: true, width: 10 },
      { header: "ADDRESS", headerFill: PALETTE.purple, editable: true, width: 20 },
      { header: "MONTHLY RENT", headerFill: PALETTE.greenDark, editable: true, numFmt: '"₱"#,##0.00' },
      { header: "DEPOSIT", headerFill: PALETTE.gold, editable: true, numFmt: '"₱"#,##0.00' },
      {
        header: "STATUS",
        headerFill: PALETTE.navyDark,
        editable: true,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: ['"Occupied,Vacant,Under Maintenance,Reserved"'], showErrorMessage: true }),
      },
      { header: "CURRENT TENANT", headerFill: PALETTE.green, editable: true, width: 16 },
    ],
    extraHeaderBlock: (ws, lastDataRow) =>
      addStatusConditionalFormat(ws, `H4:H${lastDataRow}`, [
        { text: "Occupied", fill: "DFF7E8" },
        { text: "Vacant", fill: "FFF3CD" },
      ]),
  });
}

function buildTenants(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  const lastUnitRow = 3 + MAX_ROWS;
  buildLedgerSheet(workbook, logoImageId, {
    name: "3. Tenants",
    tabColor: PALETTE.navyDark,
    sheetTitle: "TENANTS & LEASES",
    sheetTagline: "Auto-flags overdue rent & expiring leases",
    dataRowCount: MAX_ROWS / 2,
    columns: [
      { header: "TENANT", headerFill: PALETTE.navy, editable: true, width: 16 },
      {
        header: "UNIT",
        headerFill: PALETTE.blue,
        editable: true,
        width: 9,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: [`'2. Units'!$B$4:$B$${lastUnitRow}`], showErrorMessage: true }),
      },
      { header: "CONTACT", headerFill: PALETTE.green, editable: true, width: 14 },
      { header: "MONTHLY RENT", headerFill: PALETTE.greenDark, editable: true, width: 12, numFmt: '"₱"#,##0.00' },
      { header: "DUE DAY", headerFill: PALETTE.gold, editable: true, width: 8 },
      { header: "LEASE START", headerFill: PALETTE.blueLight, editable: true, width: 12, numFmt: "mm/dd/yyyy" },
      { header: "LEASE END", headerFill: PALETTE.redLight, editable: true, width: 12, numFmt: "mm/dd/yyyy" },
      { header: "LAST PAYMENT", headerFill: PALETTE.teal, editable: true, width: 12, numFmt: "mm/dd/yyyy" },
      { header: "PAID THIS MONTH?", headerFill: PALETTE.purple, editable: true, width: 12, numFmt: '"₱"#,##0.00' },
      { header: "BALANCE", headerFill: PALETTE.red, editable: false, formula: (r) => `IF(B${r}="","",D${r}-I${r})` },
      { header: "RENT STATUS", headerFill: PALETTE.navyDark, editable: false, width: 11, formula: (r) => `IF(B${r}="","",IF(J${r}<=0,"PAID",IF(DAY(TODAY())>E${r},"OVERDUE","DUE")))` },
      { header: "DAYS TO EXPIRY", headerFill: PALETTE.blueLight, editable: false, width: 12, formula: (r) => `IF(B${r}="","",G${r}-TODAY())` },
      { header: "RENEWAL", headerFill: PALETTE.greenDark, editable: false, formula: (r) => `IF(B${r}="","",IF(M${r}<0,"EXPIRED",IF(M${r}<=30,"RENEW SOON","ACTIVE")))` },
    ],
    extraHeaderBlock: (ws, lastDataRow) => {
      addStatusConditionalFormat(ws, `K4:K${lastDataRow}`, [
        { text: "OVERDUE", fill: "FCE4E4" },
        { text: "PAID", fill: "DFF7E8" },
      ]);
      addStatusConditionalFormat(ws, `N4:N${lastDataRow}`, [
        { text: "EXPIRED", fill: "FCE4E4" },
        { text: "RENEW SOON", fill: "FFF3CD" },
      ]);
    },
  });
}

function buildPayments(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "4. Payments",
    tabColor: PALETTE.navyDark,
    sheetTitle: "RENT PAYMENT LEDGER",
    sheetTagline: "Log every payment — auto-totals & overdue",
    dataRowCount: MAX_ROWS * 5,
    columns: [
      { header: "RECEIPT #", headerFill: PALETTE.navy, editable: true, width: 11 },
      { header: "TENANT", headerFill: PALETTE.green, editable: true, width: 16 },
      { header: "DATE PAID", headerFill: PALETTE.blueLight, editable: true, width: 13, numFmt: "mm/dd/yyyy", seedFormula: () => "TODAY()" },
      { header: "UNIT", headerFill: PALETTE.blue, editable: true, width: 9 },
      { header: "AMOUNT", headerFill: PALETTE.greenDark, editable: true, numFmt: '"₱"#,##0.00' },
      { header: "FOR MONTH", headerFill: PALETTE.gold, editable: true, width: 13 },
      {
        header: "METHOD",
        headerFill: PALETTE.purple,
        editable: true,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: ['"Cash,GCash,Maya,Bank Transfer,Check"'], showErrorMessage: true }),
      },
      { header: "NOTES", headerFill: PALETTE.navyDark, editable: true, width: 18 },
    ],
    extraHeaderBlock: (ws) => {
      ws.getCell("I2").value = "OUTSTANDING / OVERDUE";
      ws.getCell("I2").font = { name: FONT_NAME, size: 9, bold: true, color: { argb: argb("FFFFFF") } };
      ws.getCell("I2").fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.red) } };
      const totalCell = ws.getCell("J2");
      totalCell.value = { formula: `SUMIF('3. Tenants'!K:K,"OVERDUE",'3. Tenants'!J:J)+SUMIF('3. Tenants'!K:K,"DUE",'3. Tenants'!J:J)`, result: 0 };
      totalCell.numFmt = '"₱"#,##0.00';
      totalCell.font = { name: FONT_NAME, size: 13, bold: true, color: { argb: argb(PALETTE.red) } };
      totalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.taglineBg) } };
    },
  });
}

function buildInvoice(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  const ws = workbook.addWorksheet("5. Invoice", { properties: { tabColor: { argb: argb(PALETTE.navyDark) } } });
  ws.views = [{ showGridLines: false }];
  ws.columns = [{ width: 3 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }];
  embedLogo(ws, logoImageId);

  ws.mergeCells("B2:G2");
  const titleCell = ws.getCell("B2");
  titleCell.value = "RENTAL INVOICE";
  titleCell.font = { name: FONT_NAME, size: 24, bold: true, color: { argb: argb("FFFFFF") } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.navyDark) } };
  titleCell.alignment = { vertical: "middle" };
  ws.getRow(2).height = 32;

  ws.mergeCells("B3:G3");
  const subtitleCell = ws.getCell("B3");
  subtitleCell.value = "Negosyo Tracker PH — Rental & Landlord Manager";
  subtitleCell.font = { name: FONT_NAME, size: 10, bold: true, italic: true, color: { argb: argb(PALETTE.greenDark) } };
  subtitleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.taglineBg) } };

  ws.mergeCells("B5:G5");
  const noteCell = ws.getCell("B5");
  noteCell.value = "① Pick a tenant below — the invoice fills in automatically. ② Print to PDF (File > Save As > PDF) to send.";
  noteCell.font = { name: FONT_NAME, size: 9, bold: true, italic: true, color: { argb: argb(PALETTE.navy) } };

  ws.getCell("B7").value = "SELECT TENANT:";
  ws.getCell("B7").font = { name: FONT_NAME, size: 11, bold: true, color: { argb: argb(PALETTE.navy) } };
  const tenantCell = ws.getCell("C7");
  tenantCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.inputBg) } };
  tenantCell.font = { name: FONT_NAME, size: 12, bold: true, color: { argb: argb(PALETTE.greenDark) } };
  tenantCell.dataValidation = { type: "list", allowBlank: true, formulae: [`'3. Tenants'!$A$4:$A$${3 + MAX_ROWS / 2}`], showErrorMessage: true };
  tenantCell.protection = { locked: false };

  const fields: Array<[string, string]> = [
    ["Tenant:", "C7"],
    ["Unit / Property:", 'IFERROR(VLOOKUP(C7,\'3. Tenants\'!A:B,2,0),"")&" — "&IFERROR(VLOOKUP(IFERROR(VLOOKUP(C7,\'3. Tenants\'!A:B,2,0),""),\'2. Units\'!A:B,2,0),"")'],
    ["Monthly Rent:", 'IFERROR(VLOOKUP(C7,\'3. Tenants\'!A:D,4,0),"")'],
    ["Balance Due:", 'IFERROR(VLOOKUP(C7,\'3. Tenants\'!A:J,10,0),"")'],
    ["Invoice Date:", "TODAY()"],
  ];
  fields.forEach(([label, formula], i) => {
    const r = 10 + i;
    const labelCell = ws.getCell(`B${r}`);
    labelCell.value = label;
    labelCell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: argb(PALETTE.navy) } };
    ws.mergeCells(`C${r}:G${r}`);
    const valueCell = ws.getCell(`C${r}`);
    valueCell.value = { formula, result: "" };
    valueCell.font = { name: FONT_NAME, size: 11, color: { argb: argb(PALETTE.textDark) } };
    if (label.includes("Rent") || label.includes("Balance")) valueCell.numFmt = '"₱"#,##0.00';
    if (label.includes("Date")) valueCell.numFmt = "mm/dd/yyyy";
  });

  ws.mergeCells("B18:G18");
  const footerCell = ws.getCell("B18");
  footerCell.value = "Please settle payment on or before the due date to avoid penalties. Salamat po!";
  footerCell.font = { name: FONT_NAME, size: 9, italic: true, color: { argb: argb("888888") } };
}

function buildSOA(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  const ws = workbook.addWorksheet("6. SOA", { properties: { tabColor: { argb: argb(PALETTE.navyDark) } } });
  ws.views = [{ showGridLines: false }];
  ws.columns = [{ width: 3 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }];
  embedLogo(ws, logoImageId);

  ws.mergeCells("B2:G2");
  const titleCell = ws.getCell("B2");
  titleCell.value = "STATEMENT OF ACCOUNT (SOA)";
  titleCell.font = { name: FONT_NAME, size: 20, bold: true, color: { argb: argb("FFFFFF") } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.navyDark) } };
  ws.getRow(2).height = 30;

  ws.mergeCells("B4:G4");
  const noteCell = ws.getCell("B4");
  noteCell.value = "Pick your name to see your full payment history & balance. Print to PDF to keep a copy.";
  noteCell.font = { name: FONT_NAME, size: 9, bold: true, italic: true, color: { argb: argb(PALETTE.navy) } };

  ws.getCell("B6").value = "TENANT:";
  ws.getCell("B6").font = { name: FONT_NAME, size: 12, bold: true, color: { argb: argb(PALETTE.navy) } };
  ws.mergeCells("C6:E6");
  const tenantCell = ws.getCell("C6");
  tenantCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.inputBg) } };
  tenantCell.font = { name: FONT_NAME, size: 12, bold: true, color: { argb: argb(PALETTE.greenDark) } };
  tenantCell.dataValidation = { type: "list", allowBlank: true, formulae: [`'3. Tenants'!$A$4:$A$${3 + MAX_ROWS / 2}`], showErrorMessage: true };
  tenantCell.protection = { locked: false };

  ["RECEIPT #", "DATE PAID", "FOR MONTH", "METHOD", "AMOUNT"].forEach((h, i) => {
    const cell = ws.getCell(9, 2 + i);
    cell.value = h;
    cell.font = { name: FONT_NAME, size: 9, bold: true, color: { argb: argb("FFFFFF") } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.navy) } };
  });

  const lastPaymentsRow = 3 + MAX_ROWS * 5;
  for (let i = 0; i < 30; i++) {
    const r = 10 + i;
    const sourceRow = 5 + i;
    const isAlt = i % 2 === 0;
    const cols: Array<[string, string]> = [
      ["B", `IF('4. Payments'!B${sourceRow}=$C$6,'4. Payments'!A${sourceRow},"")`],
      ["C", `IF('4. Payments'!B${sourceRow}=$C$6,'4. Payments'!C${sourceRow},"")`],
      ["D", `IF('4. Payments'!B${sourceRow}=$C$6,'4. Payments'!F${sourceRow},"")`],
      ["E", `IF('4. Payments'!B${sourceRow}=$C$6,'4. Payments'!G${sourceRow},"")`],
      ["F", `IF('4. Payments'!B${sourceRow}=$C$6,'4. Payments'!E${sourceRow},"")`],
    ];
    cols.forEach(([col, formula]) => {
      const cell = ws.getCell(`${col}${r}`);
      cell.value = { formula, result: "" };
      cell.font = { name: FONT_NAME, size: 10 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(isAlt ? PALETTE.rowAlt : PALETTE.rowWhite) } };
      if (col === "E") cell.numFmt = '"₱"#,##0.00';
    });
  }

  ws.getCell("B41").value = "TOTAL PAID:";
  ws.getCell("B41").font = { name: FONT_NAME, size: 12, bold: true, color: { argb: argb(PALETTE.navy) } };
  const totalCell = ws.getCell("F41");
  totalCell.value = { formula: "SUM(F10:F39)", result: 0 };
  totalCell.numFmt = '"₱"#,##0.00';
  totalCell.font = { name: FONT_NAME, size: 13, bold: true, color: { argb: argb(PALETTE.greenDark) } };
}

function buildExpenses(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "7. Expenses",
    tabColor: PALETTE.navyDark,
    sheetTitle: "PROPERTY EXPENSES",
    sheetTagline: "Repairs, taxes, utilities & fees",
    dataRowCount: MAX_ROWS * 2,
    columns: [
      { header: "DATE", headerFill: PALETTE.navy, editable: true, width: 14, numFmt: "mm/dd/yyyy", seedFormula: () => "TODAY()" },
      {
        header: "CATEGORY",
        headerFill: PALETTE.blue,
        editable: true,
        width: 16,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: ['"Real Property Tax,Repairs,Maintenance,Association Dues,Utilities,Insurance,Marketing,Management Fee,Miscellaneous"'], showErrorMessage: true }),
      },
      { header: "DESCRIPTION", headerFill: PALETTE.blueLight, editable: true, width: 24 },
      { header: "AMOUNT", headerFill: PALETTE.gold, editable: true, numFmt: '"₱"#,##0.00' },
      { header: "UNIT", headerFill: PALETTE.teal, editable: true, width: 16 },
    ],
    extraHeaderBlock: (ws, lastDataRow) => {
      ws.getCell("G3").value = "TOTAL THIS MONTH";
      ws.getCell("G3").font = { name: FONT_NAME, size: 9, bold: true, color: { argb: argb("FFFFFF") } };
      ws.getCell("G3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.gold) } };
      const totalCell = ws.getCell("H4");
      totalCell.value = { formula: `SUMIFS(D4:D${lastDataRow},A4:A${lastDataRow},">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1),A4:A${lastDataRow},"<"&EDATE(DATE(YEAR(TODAY()),MONTH(TODAY()),1),1))`, result: 0 };
      totalCell.numFmt = '"₱"#,##0.00';
      totalCell.font = { name: FONT_NAME, size: 13, bold: true, color: { argb: argb(PALETTE.gold) } };
      totalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.taglineBg) } };
    },
  });
}

function buildMaintenance(workbook: ExcelJS.Workbook, logoImageId: number | null, units: string[]) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "8. Maintenance",
    tabColor: PALETTE.navyDark,
    sheetTitle: "MAINTENANCE REQUESTS",
    sheetTagline: "Track repairs from request to done",
    dataRowCount: MAX_ROWS,
    columns: [
      { header: "DATE", headerFill: PALETTE.navy, editable: true, width: 14, numFmt: "mm/dd/yyyy", seedFormula: () => "TODAY()" },
      { header: "UNIT", headerFill: PALETTE.blue, editable: true, width: 10, seedValues: units },
      { header: "ISSUE", headerFill: PALETTE.blueLight, editable: true, width: 26 },
      {
        header: "PRIORITY",
        headerFill: PALETTE.gold,
        editable: true,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: ['"High,Medium,Low"'], showErrorMessage: true }),
      },
      { header: "COST", headerFill: PALETTE.greenDark, editable: true, numFmt: '"₱"#,##0.00' },
      {
        header: "STATUS",
        headerFill: PALETTE.navyDark,
        editable: true,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: ['"Open,In Progress,Completed"'], showErrorMessage: true }),
      },
    ],
    extraHeaderBlock: (ws, lastDataRow) =>
      addStatusConditionalFormat(ws, `F4:F${lastDataRow}`, [
        { text: "Open", fill: "FCE4E4" },
        { text: "Completed", fill: "DFF7E8" },
      ]),
  });
}

function buildProfitLoss(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  const ws = workbook.addWorksheet("9. Profit & Loss", { properties: { tabColor: { argb: argb(PALETTE.navyDark) } } });
  ws.views = [{ showGridLines: false }];
  ws.columns = [{ width: 4 }, { width: 26 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }];
  embedLogo(ws, logoImageId);
  writeHeaderBar({ ws, lastCol: 5, titleText: "PROFIT & LOSS", taglineText: "Rental income minus expenses", titleFill: PALETTE.navyDark, titleSize: 18 });

  writeSectionBar(ws, 4, 2, 5, "MONTHLY P&L (current month)", PALETTE.green);
  const rows: Array<{ label: string; formula: string }> = [
    { label: "Rent Collected", formula: `SUMIFS('4. Payments'!E:E,'4. Payments'!C:C,">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1),'4. Payments'!C:C,"<"&EDATE(DATE(YEAR(TODAY()),MONTH(TODAY()),1),1))` },
    { label: "Operating Expenses", formula: `'7. Expenses'!H4` },
  ];
  rows.forEach((row, i) => {
    const r = 5 + i;
    const labelCell = ws.getCell(`B${r}`);
    labelCell.value = row.label;
    labelCell.font = { name: FONT_NAME, size: 11, color: { argb: argb(PALETTE.textDark) } };
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.rowAlt) } };
    const valueCell = ws.getCell(`E${r}`);
    valueCell.value = { formula: row.formula, result: 0 };
    valueCell.numFmt = '"₱"#,##0.00';
    valueCell.font = { name: FONT_NAME, size: 13, bold: true, color: { argb: argb(PALETTE.greenDark) } };
    valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.taglineBg) } };
  });
  const netRow = 7;
  ws.getCell(`B${netRow}`).value = "NET PROFIT (month)";
  ws.getCell(`B${netRow}`).font = { name: FONT_NAME, size: 12, bold: true, color: { argb: argb(PALETTE.navy) } };
  const netCell = ws.getCell(`E${netRow}`);
  netCell.value = { formula: `E5-E6`, result: 0 };
  netCell.numFmt = '"₱"#,##0.00';
  netCell.font = { name: FONT_NAME, size: 15, bold: true, color: { argb: argb(PALETTE.greenDark) } };

  ws.getCell("B9").value = "ANNUALIZED NET (x12, rough projection):";
  ws.getCell("B9").font = { name: FONT_NAME, size: 10, italic: true, color: { argb: argb(PALETTE.navy) } };
  const annualCell = ws.getCell("E9");
  annualCell.value = { formula: `E7*12`, result: 0 };
  annualCell.numFmt = '"₱"#,##0.00';
  annualCell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: argb(PALETTE.greenDark) } };
}

function buildContract(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  const ws = workbook.addWorksheet("10. Contract", { properties: { tabColor: { argb: argb(PALETTE.navyDark) } } });
  ws.views = [{ showGridLines: false }];
  ws.columns = [{ width: 3 }, { width: 30 }, { width: 55 }];
  embedLogo(ws, logoImageId);

  ws.mergeCells("B2:C2");
  const titleCell = ws.getCell("B2");
  titleCell.value = "RENTAL CONTRACT (TEMPLATE)";
  titleCell.font = { name: FONT_NAME, size: 20, bold: true, color: { argb: argb("FFFFFF") } };
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.navyDark) } };
  ws.getRow(2).height = 30;

  ws.mergeCells("B4:C4");
  const noteCell = ws.getCell("B4");
  noteCell.value = "Pick a tenant — key details fill in. Edit terms as needed, then print to PDF & sign.";
  noteCell.font = { name: FONT_NAME, size: 9, bold: true, italic: true, color: { argb: argb(PALETTE.navy) } };

  ws.getCell("B6").value = "SELECT TENANT:";
  ws.getCell("B6").font = { name: FONT_NAME, size: 11, bold: true, color: { argb: argb(PALETTE.navy) } };
  const tenantCell = ws.getCell("C6");
  tenantCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.inputBg) } };
  tenantCell.font = { name: FONT_NAME, size: 11, bold: true, color: { argb: argb(PALETTE.greenDark) } };
  tenantCell.dataValidation = { type: "list", allowBlank: true, formulae: [`'3. Tenants'!$A$4:$A$${3 + MAX_ROWS / 2}`], showErrorMessage: true };
  tenantCell.protection = { locked: false };

  const fields: Array<[string, string]> = [
    ["Unit / Property:", 'IFERROR(VLOOKUP(C6,\'3. Tenants\'!A:B,2,0),"")&" — "&IFERROR(VLOOKUP(IFERROR(VLOOKUP(C6,\'3. Tenants\'!A:B,2,0),""),\'2. Units\'!A:B,2,0),"")'],
    ["Monthly Rent:", 'IFERROR(VLOOKUP(C6,\'3. Tenants\'!A:D,4,0),"")'],
    ["Lease Start:", 'IFERROR(VLOOKUP(C6,\'3. Tenants\'!A:F,6,0),"")'],
    ["Lease End:", 'IFERROR(VLOOKUP(C6,\'3. Tenants\'!A:G,7,0),"")'],
    ["Security Deposit:", 'IFERROR(VLOOKUP(C6,\'3. Tenants\'!A:L,12,0),"")'],
  ];
  fields.forEach(([label, formula], i) => {
    const r = 8 + i;
    ws.getCell(`B${r}`).value = label;
    ws.getCell(`B${r}`).font = { name: FONT_NAME, size: 10, color: { argb: argb(PALETTE.navy) } };
    const valueCell = ws.getCell(`C${r}`);
    valueCell.value = { formula, result: "" };
    valueCell.font = { name: FONT_NAME, size: 10 };
    if (label.includes("Rent") || label.includes("Deposit")) valueCell.numFmt = '"₱"#,##0.00';
    if (label.includes("Lease")) valueCell.numFmt = "mm/dd/yyyy";
  });

  const terms = [
    "1. Rent is due on the agreed due day of each month. Late payment may incur penalties as per landlord policy.",
    "2. The security deposit is refundable upon move-out, less any unpaid dues or damages.",
    "3. Tenant is responsible for utilities unless otherwise stated.",
    "4. Any damages beyond normal wear and tear will be charged to the tenant.",
    "5. Either party must give written notice before lease termination, per local rental law.",
  ];
  terms.forEach((text, i) => {
    const r = 14 + i;
    ws.mergeCells(`B${r}:C${r}`);
    const cell = ws.getCell(`B${r}`);
    cell.value = text;
    cell.font = { name: FONT_NAME, size: 10 };
    cell.alignment = { wrapText: true };
    cell.protection = { locked: false };
  });

  ws.getCell("B22").value = "Landlord Signature: _______________________";
  ws.getCell("B22").font = { name: FONT_NAME, size: 10 };
  ws.getCell("B24").value = "Tenant Signature: _______________________";
  ws.getCell("B24").font = { name: FONT_NAME, size: 10 };
}
