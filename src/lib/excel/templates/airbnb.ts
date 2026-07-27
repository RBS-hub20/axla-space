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

export interface AirbnbTemplateData {
  businessName: string;
  category: CategoryDef;
  products: string[]; // property names
  mayUtang: boolean; // unused for this template — Airbnb has no utang concept
}

const MAX_ROWS = 200;

/**
 * Airbnb / short-term rental template — reverse-engineered from
 * NegosyoTracker_Airbnb_1.xlsx. Core scope (13 of the real file's 18
 * sheets): Dashboard, Properties, Reservations, Calendar, Guests,
 * Check-In/Out, Staff, Cleaning, Maintenance, Revenue, Expenses,
 * Profit & Loss, Inventory. Deferred to a later pass: Reviews, Occupancy,
 * Properties Compare, Forecast, Reports (all analytics/reporting add-ons,
 * not core day-to-day operation).
 */
export async function buildAirbnbWorkbook(workbook: ExcelJS.Workbook, data: AirbnbTemplateData) {
  const logoImageId = registerLogo(workbook);
  const properties = data.products.length > 0 ? data.products : ["Property 1", "Property 2", "Property 3"];
  const titleText = `NEGOSYO TRACKER PH — ${data.category.label}`;

  buildDashboard(workbook, logoImageId, data, titleText);
  buildProperties(workbook, logoImageId, properties);
  buildReservations(workbook, logoImageId);
  buildCalendar(workbook, logoImageId, properties);
  buildGuests(workbook, logoImageId);
  buildCheckInOut(workbook, logoImageId);
  buildStaff(workbook, logoImageId);
  buildCleaning(workbook, logoImageId, properties);
  buildMaintenance(workbook, logoImageId, properties);
  buildRevenue(workbook, logoImageId, properties);
  buildExpenses(workbook, logoImageId);
  buildProfitLoss(workbook, logoImageId);
  buildInventory(workbook, logoImageId);
}

function buildDashboard(workbook: ExcelJS.Workbook, logoImageId: number | null, data: AirbnbTemplateData, titleText: string) {
  const ws = workbook.addWorksheet("1. Dashboard", { properties: { tabColor: { argb: argb(PALETTE.navy) } } });
  ws.views = [{ showGridLines: false }];
  ws.columns = [{ width: 4 }, { width: 24 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 4 }];
  embedLogo(ws, logoImageId);

  writeHeaderBar({ ws, lastCol: 9, titleText, taglineText: data.category.tagline, titleSize: 18 });

  ws.getCell("B4").value = "HOST / BUSINESS:";
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

  const lastResRow = 3 + MAX_ROWS;
  kpi(9, "B", "Check-ins Today", PALETTE.green, `COUNTIFS('3. Reservations'!C4:C${lastResRow},$F$4)`);
  kpi(9, "D", "Check-outs Today", PALETTE.redLight, `COUNTIFS('3. Reservations'!D4:D${lastResRow},$F$4)`);
  kpi(9, "F", "Occupancy (today)", PALETTE.teal, `IFERROR(COUNTIFS('3. Reservations'!C4:C${lastResRow},"<="&$F$4,'3. Reservations'!D4:D${lastResRow},">"&$F$4)/COUNTA('2. Properties'!B4:B${3 + MAX_ROWS}),0)`);
  kpi(9, "H", "Monthly Revenue", PALETTE.blue, `SUMIFS('3. Reservations'!G:G,'3. Reservations'!C:C,">="&DATE(YEAR($F$4),MONTH($F$4),1),'3. Reservations'!C:C,"<"&EDATE(DATE(YEAR($F$4),MONTH($F$4),1),1))`, true);
  kpi(10, "B", "Upcoming Reservations", PALETTE.purple, `COUNTIFS('3. Reservations'!C4:C${lastResRow},">"&$F$4)`);
  kpi(10, "D", "Active Guests (in-house)", PALETTE.blueLight, `COUNTIFS('3. Reservations'!C4:C${lastResRow},"<="&$F$4,'3. Reservations'!D4:D${lastResRow},">"&$F$4)`);
  kpi(10, "F", "Cleaning Pending", PALETTE.gold, `COUNTIF('8. Cleaning'!F:F,"Pending")`);
  kpi(10, "H", "Maintenance Open", PALETTE.red, `COUNTIF('9. Maintenance'!F:F,"Open")`);
  kpi(11, "B", "Monthly Expenses", PALETTE.gold, `'11. Expenses'!H4`, true);
  kpi(11, "D", "Net Profit (Month)", PALETTE.greenDark, `I9-C11`, true);
  kpi(11, "F", "Properties", PALETTE.navy, `COUNTA('2. Properties'!B4:B${3 + MAX_ROWS})-COUNTBLANK('2. Properties'!B4:B${3 + MAX_ROWS})`);

  writeSectionBar(ws, 13, 2, 9, "LAST 7 DAYS — REVENUE", PALETTE.blue);
  ["DATE", "REVENUE", "CHECK-INS"].forEach((h, i) => {
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
    const revCell = ws.getCell(`C${r}`);
    revCell.value = { formula: `SUMIFS('3. Reservations'!G:G,'3. Reservations'!C:C,B${r})`, result: 0 };
    revCell.numFmt = '"₱"#,##0';
    const ciCell = ws.getCell(`D${r}`);
    ciCell.value = { formula: `COUNTIFS('3. Reservations'!C:C,B${r})`, result: 0 };
    [dateCell2, revCell, ciCell].forEach((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(isAlt ? PALETTE.rowAlt : PALETTE.rowWhite) } };
      c.font = { name: FONT_NAME, size: 10 };
    });
  }
  ws.addConditionalFormatting({ ref: "C15:C21", rules: [dataBarRule(PALETTE.blue)] });
}

function buildProperties(workbook: ExcelJS.Workbook, logoImageId: number | null, properties: string[]) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "2. Properties",
    tabColor: PALETTE.navy,
    sheetTitle: "PROPERTIES",
    sheetTagline: "Every listing, rate & status",
    dataRowCount: MAX_ROWS,
    columns: [
      { header: "PROPERTY", headerFill: PALETTE.navy, editable: true, width: 22, seedValues: properties },
      { header: "TYPE", headerFill: PALETTE.blue, editable: true, width: 12 },
      { header: "ADDRESS", headerFill: PALETTE.blueLight, editable: true, width: 22 },
      { header: "ROOMS", headerFill: PALETTE.teal, editable: true, width: 9 },
      { header: "MAX GUESTS", headerFill: PALETTE.purple, editable: true, width: 12 },
      { header: "NIGHTLY RATE", headerFill: PALETTE.greenDark, editable: true, numFmt: '"₱"#,##0.00' },
      { header: "CLEANING FEE", headerFill: PALETTE.gold, editable: true, numFmt: '"₱"#,##0.00' },
      { header: "DEPOSIT", headerFill: PALETTE.redLight, editable: true, numFmt: '"₱"#,##0.00' },
      {
        header: "STATUS",
        headerFill: PALETTE.navyDark,
        editable: true,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: ['"Active,Inactive,Under Renovation"'], showErrorMessage: true }),
      },
    ],
  });
}

function buildReservations(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "3. Reservations",
    tabColor: PALETTE.greenDark,
    sheetTitle: "RESERVATIONS",
    sheetTagline: "Bookings, dates & double-booking checks",
    dataRowCount: MAX_ROWS,
    columns: [
      { header: "BOOKING #", headerFill: PALETTE.navy, editable: true, width: 12 },
      { header: "GUEST", headerFill: PALETTE.green, editable: true, width: 18 },
      { header: "CHECK-IN", headerFill: PALETTE.blueLight, editable: true, numFmt: "mm/dd/yyyy" },
      { header: "CHECK-OUT", headerFill: PALETTE.redLight, editable: true, numFmt: "mm/dd/yyyy" },
      { header: "NIGHTS", headerFill: PALETTE.teal, editable: false, formula: (r) => `IF(OR(C${r}="",D${r}=""),"",D${r}-C${r})` },
      {
        header: "PROPERTY",
        headerFill: PALETTE.blue,
        editable: true,
        width: 18,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: [`'2. Properties'!$B$4:$B$${3 + MAX_ROWS}`], showErrorMessage: true }),
      },
      { header: "TOTAL VALUE", headerFill: PALETTE.greenDark, editable: true, numFmt: '"₱"#,##0.00' },
      {
        header: "PLATFORM",
        headerFill: PALETTE.purple,
        editable: true,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: ['"Airbnb,Booking.com,Agoda,Direct,Other"'], showErrorMessage: true }),
      },
      {
        header: "PAYMENT",
        headerFill: PALETTE.gold,
        editable: true,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: ['"Paid,Pending,Refunded"'], showErrorMessage: true }),
      },
      {
        header: "CONFLICT?",
        headerFill: PALETTE.red,
        editable: false,
        width: 12,
        formula: (r) => `IF(F${r}="","",IF(COUNTIFS($F$4:$F$${3 + MAX_ROWS},F${r},$C$4:$C$${3 + MAX_ROWS},"<"&D${r},$D$4:$D$${3 + MAX_ROWS},">"&C${r})>1,"DOUBLE-BOOK!","OK"))`,
      },
    ],
    extraHeaderBlock: (ws, lastDataRow) => {
      addStatusConditionalFormat(ws, `J4:J${lastDataRow}`, [{ text: "DOUBLE-BOOK!", fill: "FCE4E4" }]);
    },
  });
}

function buildCalendar(workbook: ExcelJS.Workbook, logoImageId: number | null, properties: string[]) {
  const ws = workbook.addWorksheet("4. Calendar", { properties: { tabColor: { argb: argb(PALETTE.purple) } } });
  ws.views = [{ showGridLines: false }];
  const days = 14;
  ws.columns = [{ width: 4 }, { width: 20 }, ...Array.from({ length: days }, () => ({ width: 9 }))];
  embedLogo(ws, logoImageId);
  writeHeaderBar({ ws, lastCol: 1 + days, titleText: "AVAILABILITY CALENDAR", taglineText: "X = booked, blank = available — next 14 days", titleFill: PALETTE.purple, titleSize: 16 });

  const headerCell = ws.getCell("B3");
  headerCell.value = "PROPERTY \\ DATE";
  headerCell.font = { name: FONT_NAME, size: 9, bold: true, color: { argb: argb("FFFFFF") } };
  headerCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.navy) } };
  for (let d = 0; d < days; d++) {
    const cell = ws.getCell(3, 3 + d);
    cell.value = { formula: `TODAY()+${d}`, result: new Date() };
    cell.numFmt = "mm/dd";
    cell.font = { name: FONT_NAME, size: 9, bold: true, color: { argb: argb("FFFFFF") } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.navy) } };
  }

  const rows = properties.length > 0 ? properties : ["Property 1"];
  rows.slice(0, 20).forEach((property, idx) => {
    const r = 4 + idx;
    const propCell = ws.getCell(r, 2);
    propCell.value = property;
    propCell.font = { name: FONT_NAME, size: 9, bold: true, color: { argb: argb(PALETTE.navy) } };
    propCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(idx % 2 === 0 ? PALETTE.rowAlt : PALETTE.rowWhite) } };
    const lastResRow = 3 + MAX_ROWS;
    for (let d = 0; d < days; d++) {
      const colLetter = ws.getColumn(3 + d).letter;
      const cell = ws.getCell(r, 3 + d);
      cell.value = {
        formula: `IF(COUNTIFS('3. Reservations'!$F:$F,$B${r},'3. Reservations'!$C:$C,"<="&${colLetter}$3,'3. Reservations'!$D:$D,">"&${colLetter}$3)>0,"X","")`,
        result: "",
      };
      cell.font = { name: FONT_NAME, size: 9, bold: true, color: { argb: argb(PALETTE.red) } };
      cell.alignment = { horizontal: "center" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(idx % 2 === 0 ? PALETTE.rowAlt : PALETTE.rowWhite) } };
      cell.protection = { locked: true };
    }
  });
}

function buildGuests(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "5. Guests",
    tabColor: PALETTE.blue,
    sheetTitle: "GUESTS",
    sheetTagline: "Profiles, history & VIP tier",
    dataRowCount: MAX_ROWS,
    columns: [
      { header: "GUEST", headerFill: PALETTE.navy, editable: true, width: 18 },
      { header: "CONTACT", headerFill: PALETTE.green, editable: true, width: 15 },
      { header: "EMAIL", headerFill: PALETTE.blue, editable: true, width: 20 },
      { header: "NATIONALITY", headerFill: PALETTE.blueLight, editable: true, width: 14 },
      { header: "TOTAL BOOKINGS", headerFill: PALETTE.purple, editable: true, width: 13 },
      { header: "TOTAL SPENT", headerFill: PALETTE.greenDark, editable: true, numFmt: '"₱"#,##0.00' },
      { header: "RATING GIVEN", headerFill: PALETTE.gold, editable: true, width: 12 },
      { header: "TIER", headerFill: PALETTE.navyDark, editable: false, formula: (r) => `IF(B${r}="","",IF(F${r}>=40000,"VIP",IF(E${r}>=3,"REPEAT","NEW")))` },
    ],
    extraHeaderBlock: (ws, lastDataRow) => {
      addStatusConditionalFormat(ws, `H4:H${lastDataRow}`, [
        { text: "VIP", fill: "DFF7E8" },
        { text: "REPEAT", fill: "FFF3CD" },
      ]);
    },
  });
}

function buildCheckInOut(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "6. Check-In Out",
    tabColor: PALETTE.blueLight,
    sheetTitle: "CHECK-IN / CHECK-OUT",
    sheetTagline: "Scheduled vs actual times & house-rules compliance",
    dataRowCount: MAX_ROWS,
    columns: [
      { header: "BOOKING #", headerFill: PALETTE.navy, editable: true, width: 12 },
      { header: "GUEST", headerFill: PALETTE.green, editable: true, width: 18 },
      { header: "SCHED CHECK-IN", headerFill: PALETTE.blueLight, editable: true, width: 14 },
      { header: "ACTUAL IN", headerFill: PALETTE.blueLight, editable: true, width: 12 },
      { header: "SCHED CHECK-OUT", headerFill: PALETTE.redLight, editable: true, width: 14 },
      { header: "ACTUAL OUT", headerFill: PALETTE.redLight, editable: true, width: 12 },
      {
        header: "RULES OK?",
        headerFill: PALETTE.greenDark,
        editable: true,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: ['"Yes,No"'], showErrorMessage: true }),
      },
    ],
  });
}

function buildStaff(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "7. Staff",
    tabColor: PALETTE.teal,
    sheetTitle: "STAFF",
    sheetTagline: "Cleaners, caretakers & their pay",
    dataRowCount: MAX_ROWS / 2,
    columns: [
      { header: "STAFF", headerFill: PALETTE.navy, editable: true, width: 18 },
      { header: "ROLE", headerFill: PALETTE.blue, editable: true, width: 14 },
      { header: "DAYS PRESENT", headerFill: PALETTE.teal, editable: true, width: 12 },
      { header: "TASKS DONE", headerFill: PALETTE.blueLight, editable: true, width: 12 },
      { header: "RATING", headerFill: PALETTE.gold, editable: true },
      { header: "SALARY (₱)", headerFill: PALETTE.greenDark, editable: true, numFmt: '"₱"#,##0.00' },
    ],
  });
}

function buildCleaning(workbook: ExcelJS.Workbook, logoImageId: number | null, properties: string[]) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "8. Cleaning",
    tabColor: PALETTE.blueLight,
    sheetTitle: "CLEANING",
    sheetTagline: "Turnover schedule & cost",
    dataRowCount: MAX_ROWS,
    columns: [
      { header: "DATE", headerFill: PALETTE.navy, editable: true, width: 14, numFmt: "mm/dd/yyyy", seedFormula: () => "TODAY()" },
      {
        header: "PROPERTY",
        headerFill: PALETTE.blue,
        editable: true,
        width: 18,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: [`'2. Properties'!$B$4:$B$${3 + MAX_ROWS}`], showErrorMessage: true }),
        seedValues: properties,
      },
      { header: "CLEANER", headerFill: PALETTE.teal, editable: true, width: 16 },
      { header: "SCHEDULE", headerFill: PALETTE.blueLight, editable: true, width: 20 },
      { header: "COST", headerFill: PALETTE.gold, editable: true, numFmt: '"₱"#,##0.00' },
      {
        header: "STATUS",
        headerFill: PALETTE.navyDark,
        editable: true,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: ['"Pending,In Progress,Done"'], showErrorMessage: true }),
      },
    ],
    extraHeaderBlock: (ws, lastDataRow) => addStatusConditionalFormat(ws, `G4:G${lastDataRow}`, [{ text: "Pending", fill: "FFF3CD" }]),
  });
}

function buildMaintenance(workbook: ExcelJS.Workbook, logoImageId: number | null, properties: string[]) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "9. Maintenance",
    tabColor: PALETTE.redLight,
    sheetTitle: "MAINTENANCE",
    sheetTagline: "Repairs from request to done",
    dataRowCount: MAX_ROWS,
    columns: [
      { header: "DATE", headerFill: PALETTE.navy, editable: true, width: 14, numFmt: "mm/dd/yyyy", seedFormula: () => "TODAY()" },
      { header: "PROPERTY", headerFill: PALETTE.blue, editable: true, width: 18, seedValues: properties },
      { header: "ISSUE TYPE", headerFill: PALETTE.redLight, editable: true, width: 16 },
      { header: "DESCRIPTION", headerFill: PALETTE.blueLight, editable: true, width: 24 },
      { header: "COST", headerFill: PALETTE.gold, editable: true, numFmt: '"₱"#,##0.00' },
      {
        header: "STATUS",
        headerFill: PALETTE.navyDark,
        editable: true,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: ['"Open,In Progress,Closed"'], showErrorMessage: true }),
      },
    ],
    extraHeaderBlock: (ws, lastDataRow) => addStatusConditionalFormat(ws, `G4:G${lastDataRow}`, [{ text: "Open", fill: "FCE4E4" }]),
  });
}

function buildRevenue(workbook: ExcelJS.Workbook, logoImageId: number | null, properties: string[]) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "10. Revenue",
    tabColor: PALETTE.greenDark,
    sheetTitle: "REVENUE LOG",
    sheetTagline: "Every booking's payout, by property",
    dataRowCount: MAX_ROWS * 2,
    columns: [
      { header: "DATE", headerFill: PALETTE.navy, editable: true, width: 14, numFmt: "mm/dd/yyyy", seedFormula: () => "TODAY()" },
      { header: "BOOKING #", headerFill: PALETTE.blue, editable: true, width: 12 },
      { header: "PROPERTY", headerFill: PALETTE.blueLight, editable: true, width: 18, seedValues: properties },
      {
        header: "PLATFORM",
        headerFill: PALETTE.purple,
        editable: true,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: ['"Airbnb,Booking.com,Agoda,Direct,Other"'], showErrorMessage: true }),
      },
      { header: "AMOUNT", headerFill: PALETTE.greenDark, editable: true, numFmt: '"₱"#,##0.00' },
    ],
    extraHeaderBlock: (ws, lastDataRow) => {
      ws.getCell("H3").value = "TOTAL THIS MONTH";
      ws.getCell("H3").font = { name: FONT_NAME, size: 9, bold: true, color: { argb: argb("FFFFFF") } };
      ws.getCell("H3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.green) } };
      const totalCell = ws.getCell("H4");
      totalCell.value = { formula: `SUMIFS(E4:E${lastDataRow},A4:A${lastDataRow},">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1),A4:A${lastDataRow},"<"&EDATE(DATE(YEAR(TODAY()),MONTH(TODAY()),1),1))`, result: 0 };
      totalCell.numFmt = '"₱"#,##0.00';
      totalCell.font = { name: FONT_NAME, size: 13, bold: true, color: { argb: argb(PALETTE.greenDark) } };
      totalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.taglineBg) } };
    },
  });
}

function buildExpenses(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "11. Expenses",
    tabColor: PALETTE.gold,
    sheetTitle: "EXPENSES",
    sheetTagline: "Repairs, taxes, utilities & fees",
    dataRowCount: MAX_ROWS * 2,
    columns: [
      { header: "DATE", headerFill: PALETTE.navy, editable: true, width: 14, numFmt: "mm/dd/yyyy", seedFormula: () => "TODAY()" },
      {
        header: "CATEGORY",
        headerFill: PALETTE.green,
        editable: true,
        width: 18,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: ['"Real Property Tax,Repairs,Maintenance,Utilities,Insurance,Marketing,Platform Fees,Miscellaneous"'], showErrorMessage: true }),
      },
      { header: "DESCRIPTION", headerFill: PALETTE.blue, editable: true, width: 22 },
      { header: "AMOUNT", headerFill: PALETTE.gold, editable: true, numFmt: '"₱"#,##0.00' },
      { header: "PROPERTY", headerFill: PALETTE.blueLight, editable: true, width: 16 },
    ],
    extraHeaderBlock: (ws, lastDataRow) => {
      ws.getCell("G3").value = "TOTAL THIS MONTH";
      ws.getCell("G3").font = { name: FONT_NAME, size: 9, bold: true, color: { argb: argb("FFFFFF") } };
      ws.getCell("G3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.gold) } };
      const totalCell = ws.getCell("G4");
      totalCell.value = { formula: `SUMIFS(D4:D${lastDataRow},A4:A${lastDataRow},">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1),A4:A${lastDataRow},"<"&EDATE(DATE(YEAR(TODAY()),MONTH(TODAY()),1),1))`, result: 0 };
      totalCell.numFmt = '"₱"#,##0.00';
      totalCell.font = { name: FONT_NAME, size: 13, bold: true, color: { argb: argb(PALETTE.gold) } };
      totalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.taglineBg) } };
    },
  });
}

function buildProfitLoss(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  const ws = workbook.addWorksheet("12. Profit & Loss", { properties: { tabColor: { argb: argb(PALETTE.navyDark) } } });
  ws.views = [{ showGridLines: false }];
  ws.columns = [{ width: 4 }, { width: 26 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }];
  embedLogo(ws, logoImageId);
  writeHeaderBar({ ws, lastCol: 5, titleText: "PROFIT & LOSS", taglineText: "Revenue, costs & net profit", titleFill: PALETTE.navyDark, titleSize: 18 });

  writeSectionBar(ws, 4, 2, 5, "MONTHLY P&L (current month)", PALETTE.green);
  const rows: Array<{ label: string; formula: string }> = [
    { label: "Rental Revenue", formula: `SUMIFS('10. Revenue'!E:E,'10. Revenue'!A:A,">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1),'10. Revenue'!A:A,"<"&EDATE(DATE(YEAR(TODAY()),MONTH(TODAY()),1),1))` },
    { label: "Cleaning Costs", formula: `SUMIFS('8. Cleaning'!E:E,'8. Cleaning'!A:A,">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1),'8. Cleaning'!A:A,"<"&EDATE(DATE(YEAR(TODAY()),MONTH(TODAY()),1),1))` },
    { label: "Maintenance Costs", formula: `SUMIFS('9. Maintenance'!E:E,'9. Maintenance'!A:A,">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1),'9. Maintenance'!A:A,"<"&EDATE(DATE(YEAR(TODAY()),MONTH(TODAY()),1),1))` },
    { label: "Operating Expenses", formula: `'11. Expenses'!G4` },
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
  const netRow = 5 + rows.length + 1;
  ws.getCell(`B${netRow}`).value = "NET PROFIT (month)";
  ws.getCell(`B${netRow}`).font = { name: FONT_NAME, size: 12, bold: true, color: { argb: argb(PALETTE.navy) } };
  const netCell = ws.getCell(`E${netRow}`);
  netCell.value = { formula: `E5-E6-E7-E8`, result: 0 };
  netCell.numFmt = '"₱"#,##0.00';
  netCell.font = { name: FONT_NAME, size: 15, bold: true, color: { argb: argb(PALETTE.greenDark) } };
}

function buildInventory(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "13. Inventory",
    tabColor: PALETTE.navy,
    sheetTitle: "SUPPLIES INVENTORY",
    sheetTagline: "Linens, toiletries & consumables",
    dataRowCount: MAX_ROWS,
    columns: [
      { header: "ITEM", headerFill: PALETTE.navy, editable: true, width: 20 },
      { header: "CATEGORY", headerFill: PALETTE.blue, editable: true, width: 14 },
      { header: "CURRENT STOCK", headerFill: PALETTE.greenDark, editable: true, width: 13 },
      { header: "UNIT", headerFill: PALETTE.gold, editable: true, width: 10 },
      { header: "REORDER LVL", headerFill: PALETTE.teal, editable: true, width: 12 },
      { header: "STATUS", headerFill: PALETTE.navyDark, editable: false, formula: (r) => `IF(B${r}="","",IF(C${r}=0,"OUT",IF(C${r}<=E${r},"LOW STOCK","OK")))` },
    ],
    extraHeaderBlock: (ws, lastDataRow) =>
      addStatusConditionalFormat(ws, `F4:F${lastDataRow}`, [
        { text: "OUT", fill: "FCE4E4" },
        { text: "LOW STOCK", fill: "FFF3CD" },
        { text: "OK", fill: "DFF7E8" },
      ]),
  });
}
