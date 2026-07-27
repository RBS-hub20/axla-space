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

export interface BarbershopTemplateData {
  businessName: string;
  category: CategoryDef;
  products: string[]; // service names
  mayUtang: boolean; // unused — no utang concept in a barbershop
}

const MAX_ROWS = 200;

/**
 * Barbershop template — reverse-engineered from NegosyoTracker_Barbershop_2.xlsx.
 * Core scope (13 of the real file's 20 sheets): Dashboard, Customers,
 * Services, Appointments, Chairs, Sales, Payroll, Attendance, Product Sales,
 * Membership, Expenses, Inventory, Profit & Loss. Deferred: Packages,
 * Equipment, Feedback, Marketing, Branches, Reports, Forecast.
 */
export async function buildBarbershopWorkbook(workbook: ExcelJS.Workbook, data: BarbershopTemplateData) {
  const logoImageId = registerLogo(workbook);
  const services = data.products.length > 0 ? data.products : ["Regular Haircut", "Fade Haircut", "Beard Trim"];
  const titleText = `NEGOSYO TRACKER PH — ${data.category.label}`;

  buildDashboard(workbook, logoImageId, data, titleText);
  buildCustomers(workbook, logoImageId);
  buildServices(workbook, logoImageId, services);
  buildAppointments(workbook, logoImageId, services);
  buildChairs(workbook, logoImageId);
  buildSales(workbook, logoImageId, services);
  buildPayroll(workbook, logoImageId);
  buildAttendance(workbook, logoImageId);
  buildProductSales(workbook, logoImageId);
  buildMembership(workbook, logoImageId);
  buildExpenses(workbook, logoImageId);
  buildInventory(workbook, logoImageId);
  buildProfitLoss(workbook, logoImageId);
}

function buildDashboard(workbook: ExcelJS.Workbook, logoImageId: number | null, data: BarbershopTemplateData, titleText: string) {
  const ws = workbook.addWorksheet("1. Dashboard", { properties: { tabColor: { argb: argb(PALETTE.navy) } } });
  ws.views = [{ showGridLines: false }];
  ws.columns = [{ width: 4 }, { width: 22 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 15 }, { width: 4 }];
  embedLogo(ws, logoImageId);

  writeHeaderBar({ ws, lastCol: 9, titleText, taglineText: data.category.tagline, titleSize: 18 });

  ws.getCell("B4").value = "SHOP / BRANCH:";
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

  const lastSalesRow = 3 + MAX_ROWS * 4;
  kpi(9, "B", "Today's Sales", PALETTE.green, `SUMIFS('6. Sales'!H:H,'6. Sales'!E:E,$F$4)`, true);
  kpi(9, "D", "Monthly Sales", PALETTE.blue, `SUMIFS('6. Sales'!H:H,'6. Sales'!E:E,">="&DATE(YEAR($F$4),MONTH($F$4),1),'6. Sales'!E:E,"<"&EDATE(DATE(YEAR($F$4),MONTH($F$4),1),1))`, true);
  kpi(9, "F", "Customers Today", PALETTE.blueLight, `COUNTIFS('6. Sales'!E:E,$F$4)`);
  kpi(9, "H", "Active Barbers", PALETTE.teal, `COUNTA('7. Payroll'!B4:B${3 + MAX_ROWS / 6})-COUNTBLANK('7. Payroll'!B4:B${3 + MAX_ROWS / 6})`);
  kpi(10, "B", "Occupied Chairs", PALETTE.gold, `'5. Chairs'!B5`);
  kpi(10, "D", "Available Chairs", PALETTE.greenDark, `'5. Chairs'!B6`);
  kpi(10, "F", "Expenses (Month)", PALETTE.gold, `'11. Expenses'!G4`, true);
  kpi(10, "H", "Net Profit (Month)", PALETTE.greenDark, `D9-F10`, true);
  kpi(11, "B", "Membership Revenue", PALETTE.purple, `'10. Membership'!B5`, true);
  kpi(11, "D", "Active Members", PALETTE.purple, `'10. Membership'!B4`);
  kpi(11, "F", "Product Sales (Month)", PALETTE.brownLight, `'9. Product Sales'!F4`, true);

  writeSectionBar(ws, 13, 2, 9, "LAST 7 DAYS — SALES & CUSTOMERS", PALETTE.blue);
  ["DATE", "SALES", "CUSTOMERS"].forEach((h, i) => {
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
    salesCell.value = { formula: `SUMIFS('6. Sales'!H:H,'6. Sales'!E:E,B${r})`, result: 0 };
    salesCell.numFmt = '"₱"#,##0';
    const custCell = ws.getCell(`D${r}`);
    custCell.value = { formula: `COUNTIFS('6. Sales'!E:E,B${r})`, result: 0 };
    [dateCell2, salesCell, custCell].forEach((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(isAlt ? PALETTE.rowAlt : PALETTE.rowWhite) } };
      c.font = { name: FONT_NAME, size: 10 };
    });
  }
  ws.addConditionalFormatting({ ref: "C15:C21", rules: [dataBarRule(PALETTE.blue)] });
}

function buildCustomers(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "2. Customers",
    tabColor: PALETTE.navy,
    sheetTitle: "CUSTOMER CRM",
    sheetTagline: "Profiles, visits, loyalty & VIP",
    dataRowCount: MAX_ROWS * 2,
    columns: [
      { header: "CUST ID", headerFill: PALETTE.navy, editable: true, width: 9 },
      { header: "FULL NAME", headerFill: PALETTE.green, editable: true, width: 18 },
      { header: "MOBILE", headerFill: PALETTE.blue, editable: true, width: 14 },
      { header: "BIRTHDAY", headerFill: PALETTE.gold, editable: true, numFmt: "mm/dd/yyyy" },
      { header: "PREFERRED BARBER", headerFill: PALETTE.teal, editable: true, width: 16 },
      { header: "LAST VISIT", headerFill: PALETTE.blueLight, editable: true, numFmt: "mm/dd/yyyy" },
      { header: "TOTAL VISITS", headerFill: PALETTE.purple, editable: true, width: 10 },
      { header: "TOTAL SPENT", headerFill: PALETTE.greenDark, editable: true, numFmt: '"₱"#,##0.00' },
      { header: "LOYALTY PTS", headerFill: PALETTE.brownLight, editable: true, width: 10 },
      { header: "TIER", headerFill: PALETTE.navyDark, editable: false, formula: (r) => `IF(B${r}="","",IF(H${r}>=8000,"VIP",IF(G${r}>=15,"LOYAL","REGULAR")))` },
    ],
    extraHeaderBlock: (ws, lastDataRow) =>
      addStatusConditionalFormat(ws, `J4:J${lastDataRow}`, [
        { text: "VIP", fill: "DFF7E8" },
        { text: "LOYAL", fill: "FFF3CD" },
      ]),
  });
}

function buildServices(workbook: ExcelJS.Workbook, logoImageId: number | null, services: string[]) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "3. Services",
    tabColor: PALETTE.navy,
    sheetTitle: "SERVICE MANAGEMENT",
    sheetTagline: "Menu, price, duration & margin",
    dataRowCount: MAX_ROWS / 10,
    columns: [
      { header: "SERVICE", headerFill: PALETTE.navy, editable: true, width: 22, seedValues: services },
      { header: "CATEGORY", headerFill: PALETTE.blue, editable: true, width: 14 },
      { header: "PRICE", headerFill: PALETTE.greenDark, editable: true, numFmt: '"₱"#,##0.00' },
      { header: "DURATION (min)", headerFill: PALETTE.blueLight, editable: true, width: 12 },
      { header: "COST", headerFill: PALETTE.gold, editable: true, numFmt: '"₱"#,##0.00' },
      { header: "MARGIN %", headerFill: PALETTE.green, editable: false, numFmt: "0.0%", formula: (r) => `IF(B${r}="","",IFERROR((C${r}-E${r})/C${r},0))` },
    ],
  });
}

function buildAppointments(workbook: ExcelJS.Workbook, logoImageId: number | null, services: string[]) {
  const lastServiceRow = 3 + MAX_ROWS / 10;
  buildLedgerSheet(workbook, logoImageId, {
    name: "4. Appointments",
    tabColor: PALETTE.greenDark,
    sheetTitle: "APPOINTMENTS & BOOKING",
    sheetTagline: "Bookings, walk-ins, queue & no-shows",
    dataRowCount: MAX_ROWS,
    columns: [
      { header: "DATE", headerFill: PALETTE.navy, editable: true, width: 14, numFmt: "mm/dd/yyyy", seedFormula: () => "TODAY()" },
      { header: "TIME", headerFill: PALETTE.blue, editable: true, width: 11 },
      { header: "CUSTOMER", headerFill: PALETTE.green, editable: true, width: 18 },
      {
        header: "SERVICE",
        headerFill: PALETTE.blueLight,
        editable: true,
        width: 18,
        seedValues: services,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: [`'3. Services'!$B$4:$B$${lastServiceRow}`], showErrorMessage: true }),
      },
      { header: "BARBER", headerFill: PALETTE.teal, editable: true, width: 15 },
      {
        header: "TYPE",
        headerFill: PALETTE.gold,
        editable: true,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: ['"Booking,Walk-In"'], showErrorMessage: true }),
      },
      {
        header: "STATUS",
        headerFill: PALETTE.navyDark,
        editable: true,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: ['"In Queue,Confirmed,Ongoing,Done,No-Show,Cancelled,Rescheduled"'], showErrorMessage: true }),
      },
    ],
    extraHeaderBlock: (ws, lastDataRow) =>
      addStatusConditionalFormat(ws, `G4:G${lastDataRow}`, [
        { text: "No-Show", fill: "FCE4E4" },
        { text: "Done", fill: "DFF7E8" },
      ]),
  });
}

function buildChairs(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  const ws = workbook.addWorksheet("5. Chairs", { properties: { tabColor: { argb: argb(PALETTE.gold) } } });
  ws.views = [{ showGridLines: false }];
  ws.columns = [{ width: 4 }, { width: 10 }, { width: 18 }, { width: 14 }, { width: 13 }, { width: 14 }, { width: 14 }];
  embedLogo(ws, logoImageId);
  writeHeaderBar({ ws, lastCol: 6, titleText: "BARBER CHAIR MANAGEMENT", taglineText: "Utilization & revenue per chair", titleFill: PALETTE.gold, titleSize: 16 });

  ws.getCell("B4").value = "TOTAL CHAIRS:";
  ws.getCell("B4").font = { name: FONT_NAME, size: 11, bold: true, color: { argb: argb(PALETTE.navy) } };
  const totalCell = ws.getCell("C4");
  totalCell.value = 6;
  totalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.inputBg) } };
  totalCell.font = { name: FONT_NAME, size: 12, bold: true, color: { argb: argb(PALETTE.greenDark) } };
  totalCell.protection = { locked: false };

  ws.getCell("B5").value = "OCCUPIED NOW:";
  ws.getCell("B5").font = { name: FONT_NAME, size: 11, bold: true, color: { argb: argb(PALETTE.navy) } };
  const occCell = ws.getCell("C5");
  occCell.value = { formula: "COUNTIF(D9:D30,\"Occupied\")", result: 0 };
  occCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.taglineBg) } };
  occCell.font = { name: FONT_NAME, size: 12, bold: true, color: { argb: argb(PALETTE.greenDark) } };

  ws.getCell("B6").value = "AVAILABLE:";
  ws.getCell("B6").font = { name: FONT_NAME, size: 11, bold: true, color: { argb: argb(PALETTE.navy) } };
  const availCell = ws.getCell("C6");
  availCell.value = { formula: "C4-C5", result: 0 };
  availCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.taglineBg) } };
  availCell.font = { name: FONT_NAME, size: 12, bold: true, color: { argb: argb(PALETTE.greenDark) } };

  ["CHAIR", "BARBER", "TODAY REVENUE (₱)", "OCCUPIED?", "UTILIZATION"].forEach((h, i) => {
    const cell = ws.getCell(8, 2 + i);
    cell.value = h;
    cell.font = { name: FONT_NAME, size: 9, bold: true, color: { argb: argb("FFFFFF") } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.navy) } };
  });
  for (let i = 0; i < 6; i++) {
    const r = 9 + i;
    const isAlt = i % 2 === 0;
    const chairCell = ws.getCell(`B${r}`);
    chairCell.value = `Chair ${i + 1}`;
    const barberCell = ws.getCell(`C${r}`);
    const revCell = ws.getCell(`D${r}`);
    revCell.numFmt = '"₱"#,##0.00';
    const occCell2 = ws.getCell(`E${r}`);
    occCell2.dataValidation = { type: "list", allowBlank: true, formulae: ['"Occupied,Available"'], showErrorMessage: true };
    const utilCell = ws.getCell(`F${r}`);
    utilCell.numFmt = "0%";
    [chairCell, barberCell, revCell, occCell2, utilCell].forEach((c) => {
      c.font = { name: FONT_NAME, size: 10 };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(isAlt ? PALETTE.rowAlt : PALETTE.rowWhite) } };
      c.protection = { locked: false };
    });
  }
  addStatusConditionalFormat(ws, "E9:E14", [{ text: "Occupied", fill: "FFF3CD" }]);
  ws.addConditionalFormatting({ ref: "F9:F14", rules: [dataBarRule(PALETTE.gold)] });
}

function buildSales(workbook: ExcelJS.Workbook, logoImageId: number | null, services: string[]) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "6. Sales",
    tabColor: PALETTE.navy,
    sheetTitle: "SALES MANAGEMENT",
    sheetTagline: "Transactions, payments & discounts",
    dataRowCount: MAX_ROWS * 4,
    columns: [
      { header: "INVOICE #", headerFill: PALETTE.navy, editable: true, width: 12 },
      { header: "CUSTOMER", headerFill: PALETTE.green, editable: true, width: 18 },
      { header: "SERVICE", headerFill: PALETTE.blue, editable: true, width: 18, seedValues: services },
      { header: "BARBER", headerFill: PALETTE.blueLight, editable: true, width: 15 },
      { header: "DATE", headerFill: PALETTE.teal, editable: true, width: 13, numFmt: "mm/dd/yyyy", seedFormula: () => "TODAY()" },
      {
        header: "METHOD",
        headerFill: PALETTE.purple,
        editable: true,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: ['"Cash,GCash,Maya,Bank Transfer,Credit Card"'], showErrorMessage: true }),
      },
      { header: "DISCOUNT", headerFill: PALETTE.gold, editable: true, numFmt: '"₱"#,##0.00' },
      { header: "AMOUNT", headerFill: PALETTE.greenDark, editable: true, numFmt: '"₱"#,##0.00' },
    ],
    extraHeaderBlock: (ws, lastDataRow) => {
      ws.getCell("F3").value = "TODAY'S SALES";
      ws.getCell("F3").font = { name: FONT_NAME, size: 9, bold: true, color: { argb: argb("FFFFFF") } };
      ws.getCell("F3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.green) } };
      const totalCell = ws.getCell("F4");
      totalCell.value = { formula: `SUMIFS(H4:H${lastDataRow},E4:E${lastDataRow},TODAY())`, result: 0 };
      totalCell.numFmt = '"₱"#,##0.00';
      totalCell.font = { name: FONT_NAME, size: 13, bold: true, color: { argb: argb(PALETTE.greenDark) } };
      totalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.taglineBg) } };
    },
  });
}

function buildPayroll(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  const ws = workbook.addWorksheet("7. Payroll", { properties: { tabColor: { argb: argb(PALETTE.navy) } } });
  ws.views = [{ showGridLines: false }];
  ws.columns = [{ width: 4 }, { width: 16 }, { width: 15 }, { width: 9 }, { width: 13 }, { width: 15 }, { width: 15 }, { width: 13 }, { width: 10 }, { width: 12 }, { width: 14 }];
  embedLogo(ws, logoImageId);
  writeHeaderBar({ ws, lastCol: 10, titleText: "BARBER PAYROLL — GUARANTEE or COMMISSION", taglineText: "Auto: daily guarantee OR commission, whichever is HIGHER", titleFill: PALETTE.navy, titleSize: 15 });

  ws.getCell("B4").value = "Rule: Final Pay = MAX(Daily Guarantee, Commission). Commission = Sales × Split %. Plus product commission, tips, incentives, minus deductions.";
  ws.getCell("B4").font = { name: FONT_NAME, size: 9, bold: true, italic: true, color: { argb: argb(PALETTE.navy) } };
  ws.mergeCells("B4:J4");
  ws.getRow(4).height = 24;

  ["BARBER", "DAILY SALES", "SPLIT %", "COMMISSION", "GUARANTEE", "FINAL PAY", "TIPS", "INCENTIVES", "DEDUCTIONS", "TOTAL PAY"].forEach((h, i) => {
    const cell = ws.getCell(6, 2 + i);
    cell.value = h;
    cell.font = { name: FONT_NAME, size: 9, bold: true, color: { argb: argb("FFFFFF") } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.navy) } };
  });
  for (let i = 0; i < MAX_ROWS / 10; i++) {
    const r = 7 + i;
    const isAlt = i % 2 === 0;
    const barberCell = ws.getCell(`B${r}`);
    const salesCell = ws.getCell(`C${r}`);
    salesCell.numFmt = '"₱"#,##0.00';
    const splitCell = ws.getCell(`D${r}`);
    splitCell.numFmt = "0%";
    const commCell = ws.getCell(`E${r}`);
    commCell.value = { formula: `IF(B${r}="","",C${r}*D${r})`, result: 0 };
    commCell.numFmt = '"₱"#,##0.00';
    const guarCell = ws.getCell(`F${r}`);
    guarCell.numFmt = '"₱"#,##0.00';
    const finalCell = ws.getCell(`G${r}`);
    finalCell.value = { formula: `IF(B${r}="","",MAX(E${r},F${r}))`, result: 0 };
    finalCell.numFmt = '"₱"#,##0.00';
    const tipsCell = ws.getCell(`H${r}`);
    tipsCell.numFmt = '"₱"#,##0.00';
    const incCell = ws.getCell(`I${r}`);
    incCell.numFmt = '"₱"#,##0.00';
    const dedCell = ws.getCell(`J${r}`);
    dedCell.numFmt = '"₱"#,##0.00';
    const totalCell = ws.getCell(`K${r}`);
    totalCell.value = { formula: `IF(B${r}="","",G${r}+H${r}+I${r}-J${r})`, result: 0 };
    totalCell.numFmt = '"₱"#,##0.00';
    const editableCells = [barberCell, salesCell, splitCell, guarCell, tipsCell, incCell, dedCell];
    const formulaCells = [commCell, finalCell, totalCell];
    editableCells.forEach((c) => {
      c.font = { name: FONT_NAME, size: 10 };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(isAlt ? PALETTE.rowAlt : PALETTE.rowWhite) } };
      c.protection = { locked: false };
    });
    formulaCells.forEach((c) => {
      c.font = { name: FONT_NAME, size: 10, bold: true, color: { argb: argb(PALETTE.greenDark) } };
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(isAlt ? PALETTE.rowAlt : PALETTE.rowWhite) } };
      c.protection = { locked: true };
    });
  }
}

function buildAttendance(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "8. Attendance",
    tabColor: PALETTE.navyDark,
    sheetTitle: "ATTENDANCE & TIME TRACKING",
    sheetTagline: "Time in/out, late detection & overtime",
    dataRowCount: MAX_ROWS,
    columns: [
      { header: "DATE", headerFill: PALETTE.navy, editable: true, width: 14, numFmt: "mm/dd/yyyy", seedFormula: () => "TODAY()" },
      { header: "BARBER", headerFill: PALETTE.green, editable: true, width: 15 },
      { header: "SCHED IN", headerFill: PALETTE.blue, editable: true },
      { header: "ACTUAL IN", headerFill: PALETTE.blueLight, editable: true },
      { header: "LATE (min)", headerFill: PALETTE.red, editable: true },
      { header: "SCHED OUT", headerFill: PALETTE.blue, editable: true },
      { header: "ACTUAL OUT", headerFill: PALETTE.blueLight, editable: true },
      { header: "OT (hrs)", headerFill: PALETTE.teal, editable: true },
    ],
  });
}

function buildProductSales(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "9. Product Sales",
    tabColor: PALETTE.navyDark,
    sheetTitle: "PRODUCT SALES & COMMISSION",
    sheetTagline: "Retail sales + barber commission",
    dataRowCount: MAX_ROWS * 2,
    columns: [
      { header: "DATE", headerFill: PALETTE.navy, editable: true, width: 14, numFmt: "mm/dd/yyyy", seedFormula: () => "TODAY()" },
      { header: "PRODUCT", headerFill: PALETTE.green, editable: true, width: 18 },
      { header: "PRICE", headerFill: PALETTE.blue, editable: true, numFmt: '"₱"#,##0.00' },
      { header: "BARBER", headerFill: PALETTE.blueLight, editable: true, width: 15 },
      { header: "COMMISSION %", headerFill: PALETTE.brownLight, editable: true, width: 12, numFmt: "0%" },
      { header: "COMMISSION (₱)", headerFill: PALETTE.brown, editable: false, width: 13, formula: (r) => `IF(B${r}="","",C${r}*E${r})`, numFmt: '"₱"#,##0.00' },
    ],
    extraHeaderBlock: (ws, lastDataRow) => {
      ws.getCell("H3").value = "PRODUCT SALES (MONTH)";
      ws.getCell("H3").font = { name: FONT_NAME, size: 9, bold: true, color: { argb: argb("FFFFFF") } };
      ws.getCell("H3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.brownLight) } };
      const totalCell = ws.getCell("H4");
      totalCell.value = { formula: `SUMIFS(C4:C${lastDataRow},A4:A${lastDataRow},">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1),A4:A${lastDataRow},"<"&EDATE(DATE(YEAR(TODAY()),MONTH(TODAY()),1),1))`, result: 0 };
      totalCell.numFmt = '"₱"#,##0.00';
      totalCell.font = { name: FONT_NAME, size: 13, bold: true, color: { argb: argb(PALETTE.brown) } };
      totalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.taglineBg) } };
    },
  });
}

function buildMembership(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "10. Membership",
    tabColor: PALETTE.purple,
    sheetTitle: "MEMBERSHIP & LOYALTY",
    sheetTagline: "Silver/Gold/Platinum, points & renewals",
    dataRowCount: MAX_ROWS,
    columns: [
      { header: "MEMBER", headerFill: PALETTE.navy, editable: true, width: 18 },
      { header: "TIER", headerFill: PALETTE.blue, editable: true, width: 12 },
      { header: "JOINED", headerFill: PALETTE.blueLight, editable: true, numFmt: "mm/dd/yyyy" },
      { header: "REVENUE", headerFill: PALETTE.greenDark, editable: true, numFmt: '"₱"#,##0.00' },
      { header: "POINTS", headerFill: PALETTE.gold, editable: true },
      { header: "STATUS", headerFill: PALETTE.navyDark, editable: false, formula: (r) => `IF(B${r}="","",IF(G${r}>=TODAY(),"ACTIVE","EXPIRED"))` },
      { header: "EXPIRY", headerFill: PALETTE.blueLight, editable: false, formula: (r) => `IF(C${r}="","",EDATE(C${r},6))`, numFmt: "mm/dd/yyyy" },
    ],
    extraHeaderBlock: (ws, lastDataRow) => {
      ws.getCell("A3").value = "ACTIVE MEMBERS →";
      ws.getCell("A3").font = { name: FONT_NAME, size: 10, bold: true, color: { argb: argb(PALETTE.navy) } };
      ws.getCell("A4").value = "COUNT:";
      ws.getCell("A4").font = { name: FONT_NAME, size: 11, bold: true, color: { argb: argb(PALETTE.navy) } };
      const countCell = ws.getCell("B4");
      countCell.value = { formula: `COUNTIF(G4:G${lastDataRow},"ACTIVE")`, result: 0 };
      countCell.font = { name: FONT_NAME, size: 14, bold: true, color: { argb: argb(PALETTE.purple) } };
      countCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.taglineBg) } };
      ws.getCell("A5").value = "REVENUE:";
      ws.getCell("A5").font = { name: FONT_NAME, size: 11, bold: true, color: { argb: argb(PALETTE.navy) } };
      const revCell = ws.getCell("B5");
      revCell.value = { formula: `SUMIF(G4:G${lastDataRow},"ACTIVE",D4:D${lastDataRow})`, result: 0 };
      revCell.numFmt = '"₱"#,##0.00';
      revCell.font = { name: FONT_NAME, size: 12, bold: true, color: { argb: argb(PALETTE.greenDark) } };
      revCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.taglineBg) } };
      addStatusConditionalFormat(ws, `F4:F${lastDataRow}`, [
        { text: "ACTIVE", fill: "DFF7E8" },
        { text: "EXPIRED", fill: "FCE4E4" },
      ]);
    },
  });
}

function buildExpenses(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "11. Expenses",
    tabColor: PALETTE.gold,
    sheetTitle: "EXPENSE MANAGEMENT",
    sheetTagline: "Operating costs & budget",
    dataRowCount: MAX_ROWS * 2,
    columns: [
      { header: "DATE", headerFill: PALETTE.navy, editable: true, width: 14, numFmt: "mm/dd/yyyy", seedFormula: () => "TODAY()" },
      {
        header: "CATEGORY",
        headerFill: PALETTE.green,
        editable: true,
        width: 18,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: ['"Rent,Electricity,Water,Internet,Payroll,Supplies,Equipment,Marketing,Miscellaneous"'], showErrorMessage: true }),
      },
      { header: "DESCRIPTION", headerFill: PALETTE.blue, editable: true, width: 22 },
      { header: "AMOUNT", headerFill: PALETTE.gold, editable: true, numFmt: '"₱"#,##0.00' },
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

function buildInventory(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "12. Inventory",
    tabColor: PALETTE.navy,
    sheetTitle: "PRODUCT INVENTORY",
    sheetTagline: "Hair, shaving & retail products",
    dataRowCount: MAX_ROWS,
    columns: [
      { header: "PRODUCT", headerFill: PALETTE.navy, editable: true, width: 18 },
      { header: "CATEGORY", headerFill: PALETTE.blue, editable: true, width: 14 },
      { header: "STOCK IN", headerFill: PALETTE.green, editable: true },
      { header: "STOCK OUT", headerFill: PALETTE.red, editable: true },
      { header: "CURRENT", headerFill: PALETTE.greenDark, editable: false, formula: (r) => `IF(B${r}="","",C${r}-D${r})` },
      { header: "REORDER LVL", headerFill: PALETTE.teal, editable: true, width: 12 },
      { header: "SUPPLIER", headerFill: PALETTE.gold, editable: true, width: 16 },
      { header: "STATUS", headerFill: PALETTE.navyDark, editable: false, formula: (r) => `IF(B${r}="","",IF(E${r}=0,"OUT",IF(E${r}<=F${r},"LOW STOCK","OK")))` },
    ],
    extraHeaderBlock: (ws, lastDataRow) =>
      addStatusConditionalFormat(ws, `H4:H${lastDataRow}`, [
        { text: "OUT", fill: "FCE4E4" },
        { text: "LOW STOCK", fill: "FFF3CD" },
        { text: "OK", fill: "DFF7E8" },
      ]),
  });
}

function buildProfitLoss(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  const ws = workbook.addWorksheet("13. Profit & Loss", { properties: { tabColor: { argb: argb(PALETTE.navyDark) } } });
  ws.views = [{ showGridLines: false }];
  ws.columns = [{ width: 4 }, { width: 26 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }];
  embedLogo(ws, logoImageId);
  writeHeaderBar({ ws, lastCol: 5, titleText: "PROFIT & LOSS", taglineText: "Revenue, costs & net profit", titleFill: PALETTE.navyDark, titleSize: 18 });

  writeSectionBar(ws, 4, 2, 5, "MONTHLY P&L (current month)", PALETTE.green);
  const rows: Array<{ label: string; formula: string }> = [
    { label: "Service Revenue (Sales)", formula: `'1. Dashboard'!D9` },
    { label: "Product Sales", formula: `'9. Product Sales'!H4` },
    { label: "Membership Revenue", formula: `'10. Membership'!B5` },
    { label: "Barber Payroll", formula: `SUM('7. Payroll'!K7:K26)` },
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
  netCell.value = { formula: `E5+E6+E7-E8-E9`, result: 0 };
  netCell.numFmt = '"₱"#,##0.00';
  netCell.font = { name: FONT_NAME, size: 15, bold: true, color: { argb: argb(PALETTE.greenDark) } };
}
