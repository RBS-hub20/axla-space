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

export interface CarWashTemplateData {
  businessName: string;
  category: CategoryDef;
  products: string[]; // service names
  mayUtang: boolean; // unused — no utang concept in a car wash
}

const MAX_ROWS = 200;

/**
 * Car Wash template — reverse-engineered from NegosyoTracker_CarWash_1.xlsx.
 * Core scope (12 of the real file's 15 sheets): Dashboard, Customers,
 * Services, Vehicle Tracker, Sales, Inventory, Water Usage, Employees,
 * Expenses, Profit & Loss, Membership, Booking. Deferred: Branches, Reports,
 * Forecast.
 */
export async function buildCarWashWorkbook(workbook: ExcelJS.Workbook, data: CarWashTemplateData) {
  const logoImageId = registerLogo(workbook);
  const services = data.products.length > 0 ? data.products : ["Basic Wash", "Premium Wash", "Vacuum Service"];
  const titleText = `NEGOSYO TRACKER PH — ${data.category.label}`;

  buildDashboard(workbook, logoImageId, data, titleText);
  buildCustomers(workbook, logoImageId);
  buildServices(workbook, logoImageId, services);
  buildVehicleTracker(workbook, logoImageId, services);
  buildSales(workbook, logoImageId, services);
  buildInventory(workbook, logoImageId);
  buildWaterUsage(workbook, logoImageId);
  buildEmployees(workbook, logoImageId);
  buildExpenses(workbook, logoImageId);
  buildProfitLoss(workbook, logoImageId);
  buildMembership(workbook, logoImageId);
  buildBooking(workbook, logoImageId, services);
}

function buildDashboard(workbook: ExcelJS.Workbook, logoImageId: number | null, data: CarWashTemplateData, titleText: string) {
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

  kpi(9, "B", "Today's Sales", PALETTE.green, `SUMIFS('5. Sales'!E:E,'5. Sales'!A:A,$F$4)`, true);
  kpi(9, "D", "Monthly Sales", PALETTE.blue, `SUMIFS('5. Sales'!E:E,'5. Sales'!A:A,">="&DATE(YEAR($F$4),MONTH($F$4),1),'5. Sales'!A:A,"<"&EDATE(DATE(YEAR($F$4),MONTH($F$4),1),1))`, true);
  kpi(9, "F", "Vehicles Today", PALETTE.blueLight, `COUNTIFS('4. Vehicle Tracker'!F:F,$F$4)`);
  kpi(9, "H", "Active Customers", PALETTE.teal, `COUNTA('2. Customers'!B4:B${3 + MAX_ROWS * 2})-COUNTBLANK('2. Customers'!B4:B${3 + MAX_ROWS * 2})`);
  kpi(10, "B", "Expenses (Month)", PALETTE.gold, `'9. Expenses'!G4`, true);
  kpi(10, "D", "Net Profit (Month)", PALETTE.greenDark, `D9-B10`, true);
  kpi(10, "F", "Inventory Alerts", PALETTE.red, `COUNTIF('6. Inventory'!H:H,"LOW STOCK")+COUNTIF('6. Inventory'!H:H,"OUT")`);
  kpi(10, "H", "Active Members", PALETTE.purple, `'11. Membership'!B4`);

  writeSectionBar(ws, 12, 2, 9, "LAST 7 DAYS — SALES & VEHICLES", PALETTE.blue);
  ["DATE", "SALES", "VEHICLES"].forEach((h, i) => {
    const cell = ws.getCell(13, 2 + i);
    cell.value = h;
    cell.font = { name: FONT_NAME, size: 9, bold: true, color: { argb: argb("FFFFFF") } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.navy) } };
  });
  for (let i = 0; i < 7; i++) {
    const r = 14 + i;
    const isAlt = i % 2 === 0;
    const dateCell2 = ws.getCell(`B${r}`);
    dateCell2.value = { formula: `TODAY()-${6 - i}`, result: new Date() };
    dateCell2.numFmt = "mm/dd";
    const salesCell = ws.getCell(`C${r}`);
    salesCell.value = { formula: `SUMIFS('5. Sales'!E:E,'5. Sales'!A:A,B${r})`, result: 0 };
    salesCell.numFmt = '"₱"#,##0';
    const vehCell = ws.getCell(`D${r}`);
    vehCell.value = { formula: `COUNTIFS('4. Vehicle Tracker'!F:F,B${r})`, result: 0 };
    [dateCell2, salesCell, vehCell].forEach((c) => {
      c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(isAlt ? PALETTE.rowAlt : PALETTE.rowWhite) } };
      c.font = { name: FONT_NAME, size: 10 };
    });
  }
  ws.addConditionalFormatting({ ref: "C14:C20", rules: [dataBarRule(PALETTE.blue)] });
}

function buildCustomers(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "2. Customers",
    tabColor: PALETTE.navy,
    sheetTitle: "CUSTOMER MANAGEMENT",
    sheetTagline: "Customer profiles, history, loyalty & VIP",
    dataRowCount: MAX_ROWS * 2,
    columns: [
      { header: "CUSTOMER NAME", headerFill: PALETTE.navy, editable: true, width: 18 },
      { header: "MOBILE", headerFill: PALETTE.green, editable: true, width: 14 },
      {
        header: "VEHICLE TYPE",
        headerFill: PALETTE.blue,
        editable: true,
        width: 12,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: ['"Sedan,SUV,Pickup,Van,Motorcycle,Truck,Hatchback,MPV"'], showErrorMessage: true }),
      },
      { header: "PLATE NO.", headerFill: PALETTE.gold, editable: true, width: 11 },
      { header: "VEHICLE MODEL", headerFill: PALETTE.blueLight, editable: true, width: 16 },
      { header: "LAST VISIT", headerFill: PALETTE.teal, editable: true, numFmt: "mm/dd/yyyy" },
      { header: "TOTAL VISITS", headerFill: PALETTE.purple, editable: true, width: 10 },
      { header: "TOTAL SPENT", headerFill: PALETTE.greenDark, editable: true, numFmt: '"₱"#,##0.00' },
      { header: "TIER", headerFill: PALETTE.navyDark, editable: false, formula: (r) => `IF(B${r}="","",IF(H${r}>=8000,"VIP",IF(G${r}>=10,"LOYAL","REGULAR")))` },
    ],
    extraHeaderBlock: (ws, lastDataRow) =>
      addStatusConditionalFormat(ws, `I4:I${lastDataRow}`, [
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
    sheetTagline: "Service menu, prices & duration",
    dataRowCount: MAX_ROWS / 15,
    columns: [
      { header: "SERVICE", headerFill: PALETTE.navy, editable: true, width: 24, seedValues: services },
      { header: "PRICE", headerFill: PALETTE.greenDark, editable: true, numFmt: '"₱"#,##0.00' },
      { header: "DURATION (min)", headerFill: PALETTE.blue, editable: true, width: 13 },
      {
        header: "TYPE",
        headerFill: PALETTE.gold,
        editable: true,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: ['"Wash,Add-on,Detailing"'], showErrorMessage: true }),
      },
      { header: "NOTES", headerFill: PALETTE.navyDark, editable: true, width: 22 },
    ],
  });
}

function buildVehicleTracker(workbook: ExcelJS.Workbook, logoImageId: number | null, services: string[]) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "4. Vehicle Tracker",
    tabColor: PALETTE.greenDark,
    sheetTitle: "VEHICLE SERVICE TRACKER",
    sheetTagline: "Job orders & status workflow",
    dataRowCount: MAX_ROWS * 2,
    columns: [
      { header: "JOB ORDER #", headerFill: PALETTE.navy, editable: true, width: 12 },
      { header: "CUSTOMER", headerFill: PALETTE.green, editable: true, width: 18 },
      { header: "PLATE NO.", headerFill: PALETTE.gold, editable: true, width: 11 },
      {
        header: "VEHICLE TYPE",
        headerFill: PALETTE.blue,
        editable: true,
        width: 12,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: ['"Sedan,SUV,Pickup,Van,Motorcycle,Truck,Hatchback,MPV"'], showErrorMessage: true }),
      },
      { header: "SERVICE PACKAGE", headerFill: PALETTE.blueLight, editable: true, width: 18, seedValues: services },
      { header: "DATE", headerFill: PALETTE.teal, editable: true, width: 13, numFmt: "mm/dd/yyyy", seedFormula: () => "TODAY()" },
      { header: "CHECK-IN", headerFill: PALETTE.purple, editable: true, width: 11 },
      { header: "COMPLETED", headerFill: PALETTE.greenDark, editable: true, width: 11 },
      {
        header: "STATUS",
        headerFill: PALETTE.navyDark,
        editable: true,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: ['"Waiting,Washing,Drying,Detailing,Quality Check,Completed,Released"'], showErrorMessage: true }),
      },
    ],
    extraHeaderBlock: (ws, lastDataRow) => addStatusConditionalFormat(ws, `I4:I${lastDataRow}`, [{ text: "Released", fill: "DFF7E8" }]),
  });
}

function buildSales(workbook: ExcelJS.Workbook, logoImageId: number | null, services: string[]) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "5. Sales",
    tabColor: PALETTE.navy,
    sheetTitle: "SALES MANAGEMENT",
    sheetTagline: "Daily transactions & payment methods",
    dataRowCount: MAX_ROWS * 4,
    columns: [
      { header: "DATE", headerFill: PALETTE.navy, editable: true, width: 14, numFmt: "mm/dd/yyyy", seedFormula: () => "TODAY()" },
      { header: "JOB ORDER #", headerFill: PALETTE.blue, editable: true, width: 12 },
      { header: "CUSTOMER", headerFill: PALETTE.green, editable: true, width: 18 },
      { header: "SERVICE", headerFill: PALETTE.blueLight, editable: true, width: 18, seedValues: services },
      { header: "AMOUNT", headerFill: PALETTE.greenDark, editable: true, numFmt: '"₱"#,##0.00' },
      {
        header: "METHOD",
        headerFill: PALETTE.purple,
        editable: true,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: ['"Cash,GCash,Maya,Bank Transfer"'], showErrorMessage: true }),
      },
    ],
    extraHeaderBlock: (ws, lastDataRow) => {
      ws.getCell("F3").value = "TODAY'S SALES";
      ws.getCell("F3").font = { name: FONT_NAME, size: 9, bold: true, color: { argb: argb("FFFFFF") } };
      ws.getCell("F3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.green) } };
      const totalCell = ws.getCell("F4");
      totalCell.value = { formula: `SUMIFS(E4:E${lastDataRow},A4:A${lastDataRow},TODAY())`, result: 0 };
      totalCell.numFmt = '"₱"#,##0.00';
      totalCell.font = { name: FONT_NAME, size: 13, bold: true, color: { argb: argb(PALETTE.greenDark) } };
      totalCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.taglineBg) } };

      ws.getCell("H3").value = "PAYMENT BREAKDOWN (today)";
      ws.getCell("H3").font = { name: FONT_NAME, size: 10, bold: true, color: { argb: argb("FFFFFF") } };
      ws.getCell("H3").fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(PALETTE.navy) } };
      ["Cash", "GCash", "Maya"].forEach((method, i) => {
        const labelCell = ws.getCell(`H${4 + i}`);
        labelCell.value = method;
        labelCell.font = { name: FONT_NAME, size: 9, bold: true, color: { argb: argb(PALETTE.textDark) } };
        const valueCell = ws.getCell(`I${4 + i}`);
        valueCell.value = { formula: `SUMIFS(E4:E${lastDataRow},A4:A${lastDataRow},TODAY(),F4:F${lastDataRow},H${4 + i})`, result: 0 };
        valueCell.numFmt = '"₱"#,##0';
        valueCell.font = { name: FONT_NAME, size: 9, bold: true, color: { argb: argb(PALETTE.greenDark) } };
      });
    },
  });
}

function buildInventory(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "6. Inventory",
    tabColor: PALETTE.navy,
    sheetTitle: "INVENTORY MANAGEMENT",
    sheetTagline: "Consumables stock, alerts & suppliers",
    dataRowCount: MAX_ROWS,
    columns: [
      { header: "ITEM", headerFill: PALETTE.navy, editable: true, width: 22 },
      { header: "UNIT", headerFill: PALETTE.gold, editable: true, width: 8 },
      { header: "STOCK IN", headerFill: PALETTE.green, editable: true },
      { header: "STOCK OUT", headerFill: PALETTE.red, editable: true },
      { header: "CURRENT STOCK", headerFill: PALETTE.greenDark, editable: false, width: 13, formula: (r) => `IF(B${r}="","",C${r}-D${r})` },
      { header: "REORDER LEVEL", headerFill: PALETTE.teal, editable: true, width: 13 },
      { header: "SUPPLIER", headerFill: PALETTE.blue, editable: true, width: 18 },
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

function buildWaterUsage(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "7. Water Usage",
    tabColor: PALETTE.blueLight,
    sheetTitle: "WATER CONSUMPTION",
    sheetTagline: "Daily usage, cost per vehicle & efficiency",
    dataRowCount: MAX_ROWS,
    columns: [
      { header: "DATE", headerFill: PALETTE.navy, editable: true, width: 14, numFmt: "mm/dd/yyyy", seedFormula: () => "TODAY()" },
      { header: "LITERS USED", headerFill: PALETTE.blueLight, editable: true, width: 13 },
      { header: "VEHICLES SERVED", headerFill: PALETTE.blue, editable: true, width: 14 },
      { header: "WATER COST (₱)", headerFill: PALETTE.gold, editable: true, width: 13, numFmt: '"₱"#,##0.00' },
      { header: "COST / VEHICLE", headerFill: PALETTE.greenDark, editable: false, width: 13, formula: (r) => `IF(B${r}="","",IFERROR(D${r}/C${r},0))`, numFmt: '"₱"#,##0.00' },
      { header: "LITERS / VEHICLE", headerFill: PALETTE.teal, editable: false, width: 14, formula: (r) => `IF(B${r}="","",IFERROR(B${r}/C${r},0))` },
    ],
  });
}

function buildEmployees(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "8. Employees",
    tabColor: PALETTE.navy,
    sheetTitle: "EMPLOYEE MANAGEMENT",
    sheetTagline: "Attendance, productivity, commission & salary",
    dataRowCount: 8,
    columns: [
      { header: "EMPLOYEE", headerFill: PALETTE.navy, editable: true, width: 18 },
      { header: "POSITION", headerFill: PALETTE.blue, editable: true, width: 14 },
      { header: "DAYS PRESENT", headerFill: PALETTE.teal, editable: true, width: 12 },
      { header: "VEHICLES SERVED", headerFill: PALETTE.blueLight, editable: true, width: 14 },
      { header: "SALARY (₱)", headerFill: PALETTE.greenDark, editable: true, numFmt: '"₱"#,##0.00' },
      { header: "COMMISSION (₱)", headerFill: PALETTE.gold, editable: true, numFmt: '"₱"#,##0.00' },
      { header: "TOTAL PAY", headerFill: PALETTE.green, editable: false, formula: (r) => `IF(B${r}="","",E${r}+F${r})`, numFmt: '"₱"#,##0.00' },
    ],
  });
}

function buildExpenses(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "9. Expenses",
    tabColor: PALETTE.gold,
    sheetTitle: "EXPENSE MONITORING",
    sheetTagline: "Operating costs & budget",
    dataRowCount: MAX_ROWS * 2,
    columns: [
      { header: "DATE", headerFill: PALETTE.navy, editable: true, width: 14, numFmt: "mm/dd/yyyy", seedFormula: () => "TODAY()" },
      {
        header: "CATEGORY",
        headerFill: PALETTE.green,
        editable: true,
        width: 18,
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: ['"Water Bill,Electricity,Rent,Payroll,Supplies,Maintenance,Marketing,Miscellaneous"'], showErrorMessage: true }),
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

function buildProfitLoss(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  const ws = workbook.addWorksheet("10. Profit & Loss", { properties: { tabColor: { argb: argb(PALETTE.navyDark) } } });
  ws.views = [{ showGridLines: false }];
  ws.columns = [{ width: 4 }, { width: 26 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 }];
  embedLogo(ws, logoImageId);
  writeHeaderBar({ ws, lastCol: 5, titleText: "PROFIT & LOSS", taglineText: "Revenue, expenses & net profit", titleFill: PALETTE.navyDark, titleSize: 18 });

  writeSectionBar(ws, 4, 2, 5, "MONTHLY P&L (current month)", PALETTE.green);
  const rows: Array<{ label: string; formula: string }> = [
    { label: "Gross Revenue (Sales)", formula: `SUMIFS('5. Sales'!E:E,'5. Sales'!A:A,">="&DATE(YEAR(TODAY()),MONTH(TODAY()),1),'5. Sales'!A:A,"<"&EDATE(DATE(YEAR(TODAY()),MONTH(TODAY()),1),1))` },
    { label: "Membership Revenue", formula: `'11. Membership'!B5` },
    { label: "Water Cost", formula: `SUM('7. Water Usage'!D4:D${3 + MAX_ROWS})` },
    { label: "Operating Expenses", formula: `'9. Expenses'!G4` },
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
  netCell.value = { formula: `E5+E6-E7-E8`, result: 0 };
  netCell.numFmt = '"₱"#,##0.00';
  netCell.font = { name: FONT_NAME, size: 15, bold: true, color: { argb: argb(PALETTE.greenDark) } };
}

function buildMembership(workbook: ExcelJS.Workbook, logoImageId: number | null) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "11. Membership",
    tabColor: PALETTE.purple,
    sheetTitle: "MEMBERSHIP & LOYALTY",
    sheetTagline: "Members, packages, points & renewals",
    dataRowCount: MAX_ROWS,
    columns: [
      { header: "MEMBER", headerFill: PALETTE.navy, editable: true, width: 18 },
      { header: "PACKAGE", headerFill: PALETTE.blue, editable: true, width: 18 },
      { header: "JOINED", headerFill: PALETTE.blueLight, editable: true, numFmt: "mm/dd/yyyy" },
      { header: "REVENUE", headerFill: PALETTE.greenDark, editable: true, numFmt: '"₱"#,##0.00' },
      { header: "WASHES USED", headerFill: PALETTE.gold, editable: true, width: 12 },
      { header: "STATUS", headerFill: PALETTE.navyDark, editable: false, formula: (r) => `IF(B${r}="","",IF(G${r}>=TODAY(),"ACTIVE","EXPIRED"))` },
      { header: "EXPIRY", headerFill: PALETTE.blueLight, editable: false, formula: (r) => `IF(C${r}="","",EDATE(C${r},12))`, numFmt: "mm/dd/yyyy" },
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

function buildBooking(workbook: ExcelJS.Workbook, logoImageId: number | null, services: string[]) {
  buildLedgerSheet(workbook, logoImageId, {
    name: "12. Booking",
    tabColor: PALETTE.navy,
    sheetTitle: "APPOINTMENT & BOOKING",
    sheetTagline: "Walk-in & booking log, queue management",
    dataRowCount: MAX_ROWS,
    columns: [
      { header: "DATE", headerFill: PALETTE.navy, editable: true, width: 14, numFmt: "mm/dd/yyyy", seedFormula: () => "TODAY()" },
      { header: "TIME", headerFill: PALETTE.blue, editable: true, width: 11 },
      { header: "CUSTOMER", headerFill: PALETTE.green, editable: true, width: 18 },
      { header: "SERVICE", headerFill: PALETTE.blueLight, editable: true, width: 18, seedValues: services },
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
        dataValidation: () => ({ type: "list", allowBlank: true, formulae: ['"In Queue,Confirmed,Ongoing,Done,No-Show,Cancelled"'], showErrorMessage: true }),
      },
    ],
  });
}
