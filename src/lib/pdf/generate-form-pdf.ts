import "server-only";
import { PDFDocument, StandardFonts, rgb, degrees, type PDFFont } from "pdf-lib";
import type { TaxType } from "@/lib/tax-calculator";

export interface FormPdfData {
  formId: string;
  formType: string;
  status: "draft" | "filed";
  filedAt: string | null;
  /** Free plan gets a "DRAFT — AXLA FREE" watermark; Pro/Business get a clean PDF. */
  isFreePlan: boolean;

  taxpayerName: string;
  tinNumber: string | null;
  rdoCode: string | null;
  businessName: string | null;
  branchCode: string | null;
  address: string | null;
  taxType: TaxType;

  quarter: number;
  year: number;
  deadline: string; // ISO date

  income: number;
  expenses: number;
  deductibleReceiptsTotal: number | null; // sum of receipts.category='deductible' for the period, null if none on file
  baseTax: number;
  surcharge: number;
  interest: number;
  taxDue: number;
  isLate: boolean;
}

const PESO = (n: number) => `PHP ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const TAX_TYPE_LABEL: Record<TaxType, string> = {
  "8%": "8% Flat Rate",
  "3%": "3% Percentage Tax",
  itemized: "Graduated (Itemized Deductions)",
};

const PAGE_WIDTH = 595;
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const GREEN = rgb(0, 0.72, 0.4);
const DARK = rgb(0.08, 0.1, 0.14);
const GRAY = rgb(0.42, 0.46, 0.52);
const LIGHT_GRAY_BG = rgb(0.95, 0.96, 0.97);
const BORDER = rgb(0.85, 0.86, 0.88);
const RED = rgb(0.75, 0.15, 0.15);
const AMBER = rgb(0.72, 0.5, 0.05);

/** Greedy word-wrap so long fields (address, business name) don't run off the page. */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Generates a clean, boxed reference computation sheet — NOT a facsimile of
 * the official BIR form. Reproducing the actual 2551Q/1701Q/0619E government
 * form layout would be easy to mistake for something submittable as-is,
 * which it isn't — you still file through eBIRForms/eFPS or the physical
 * form. This is what you'd hand your accountant, or use to fill in the real
 * form accurately.
 */
export async function generateFormPdf(data: FormPdfData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, 842]); // A4
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 800;

  // ---- Header ----
  page.drawText("AXLA", { x: MARGIN, y, size: 20, font: bold, color: GREEN });
  page.drawText(" TAXLAYA", { x: MARGIN + font.widthOfTextAtSize("AXLA", 20) + 2, y, size: 20, font: bold, color: DARK });
  page.drawText("BIR TAX FILING REFERENCE SHEET", { x: PAGE_WIDTH - MARGIN - 220, y: y + 5, size: 9, font: bold, color: GRAY });
  y -= 16;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1.5, color: GREEN });
  y -= 8;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: BORDER });
  y -= 24;

  const hasTin = Boolean(data.tinNumber && data.tinNumber.trim());
  if (!hasTin) {
    page.drawText("INCOMPLETE PROFILE — TIN NOT SET", {
      x: MARGIN,
      y,
      size: 10,
      font: bold,
      color: RED,
    });
    y -= 20;
  }

  // ---- Section helper: draws a light-gray box with a title, returns the y position for rows inside ----
  function drawSection(title: string, height: number): number {
    page.drawRectangle({
      x: MARGIN,
      y: y - height,
      width: CONTENT_WIDTH,
      height,
      color: LIGHT_GRAY_BG,
      borderColor: BORDER,
      borderWidth: 1,
    });
    page.drawText(title, { x: MARGIN + 12, y: y - 18, size: 10, font: bold, color: DARK });
    return y - 38;
  }

  function row(label: string, value: string, rowY: number, valueColor = DARK): number {
    page.drawText(label, { x: MARGIN + 12, y: rowY, size: 9, font, color: GRAY });
    page.drawText(value, { x: MARGIN + 190, y: rowY, size: 9, font: bold, color: valueColor });
    return rowY - 18;
  }

  // ---- Taxpayer Details ----
  const taxpayerSectionHeight = 208;
  let ry = drawSection("TAXPAYER DETAILS", taxpayerSectionHeight);
  ry = row("Full Name:", data.taxpayerName, ry);
  ry = row("TIN:", hasTin ? data.tinNumber! : "Not set — update in Settings", ry, hasTin ? DARK : RED);
  ry = row("Branch Code:", data.branchCode || "000", ry);
  ry = row("RDO Code:", data.rdoCode || "Not set", ry, data.rdoCode ? DARK : AMBER);
  ry = row("Business Name:", data.businessName || data.taxpayerName, ry);

  const addressLines = wrapText(data.address || "Not set", font, 9, CONTENT_WIDTH - 190 - 12);
  page.drawText("Business Address:", { x: MARGIN + 12, y: ry, size: 9, font, color: GRAY });
  for (const line of addressLines.length ? addressLines : ["Not set"]) {
    page.drawText(line, { x: MARGIN + 190, y: ry, size: 9, font: bold, color: data.address ? DARK : AMBER });
    ry -= 14;
  }
  ry -= 4;
  ry = row("Tax Regime:", TAX_TYPE_LABEL[data.taxType], ry, GREEN);

  y -= taxpayerSectionHeight + 16;

  // ---- Filing Details ----
  const filingSectionHeight = 108;
  ry = drawSection("FILING DETAILS", filingSectionHeight);
  ry = row("Form:", `BIR Form ${data.formType}`, ry);
  ry = row("Period:", `Q${data.quarter} ${data.year}`, ry);
  const deadlineDate = new Date(data.deadline);
  const deadlineLabel = deadlineDate.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  ry = row("Deadline:", deadlineLabel, ry, data.isLate ? RED : DARK);
  ry = row("Filing Status:", data.status === "filed" ? `Filed${data.filedAt ? " — " + new Date(data.filedAt).toLocaleDateString("en-PH") : ""}` : "Draft", ry, data.status === "filed" ? GREEN : AMBER);
  ry = row("Verify:", `axla.space/verify/${data.formId}`, ry, GRAY);

  y -= filingSectionHeight + 16;

  // ---- Computation ----
  const hasNote = data.expenses === 0 && (data.deductibleReceiptsTotal === null || data.deductibleReceiptsTotal === 0);
  const has8PctNote = data.taxType === "8%";
  const computationSectionHeight = 168 + (hasNote ? 28 : 0) + (has8PctNote ? 24 : 0) + (data.isLate ? 32 : 0);
  ry = drawSection("COMPUTATION", computationSectionHeight);
  ry = row("Gross Income:", PESO(data.income), ry);
  ry = row("Less: Expenses:", PESO(data.expenses), ry);

  if (data.deductibleReceiptsTotal !== null) {
    ry = row("Deductible receipts on file:", PESO(data.deductibleReceiptsTotal), ry, GRAY);
  }

  if (hasNote) {
    for (const line of wrapText(
      "No deductible expenses recorded — upload receipts at /dashboard/documents to lower your tax.",
      font,
      8,
      CONTENT_WIDTH - 24,
    )) {
      page.drawText(line, { x: MARGIN + 12, y: ry, size: 8, font, color: AMBER });
      ry -= 12;
    }
    ry -= 4;
  }

  if (has8PctNote) {
    for (const line of wrapText(
      "8% Tax Regime: annual formula is (Gross - 250,000) x 8%. No OSD/itemized deductions allowed under this regime.",
      font,
      8,
      CONTENT_WIDTH - 24,
    )) {
      page.drawText(line, { x: MARGIN + 12, y: ry, size: 8, font, color: GRAY });
      ry -= 12;
    }
    ry -= 4;
  }

  const taxableIncome = data.taxType === "3%" ? data.income : Math.max(0, data.income - data.expenses);
  ry = row("Taxable Income:", PESO(taxableIncome), ry);
  ry = row("Base Tax:", PESO(data.baseTax), ry);

  if (data.isLate) {
    ry = row("Surcharge (25%):", PESO(data.surcharge), ry, RED);
    ry = row("Interest:", PESO(data.interest), ry, RED);
  }

  ry -= 6;
  page.drawLine({ start: { x: MARGIN + 12, y: ry + 10 }, end: { x: PAGE_WIDTH - MARGIN - 12, y: ry + 10 }, thickness: 1, color: BORDER });
  ry -= 12;

  page.drawText("TOTAL DUE", { x: MARGIN + 12, y: ry - 6, size: 14, font: bold, color: DARK });
  const totalText = PESO(data.taxDue);
  const totalWidth = bold.widthOfTextAtSize(totalText, 22);
  page.drawText(totalText, { x: PAGE_WIDTH - MARGIN - 12 - totalWidth, y: ry - 8, size: 22, font: bold, color: GREEN });

  y -= computationSectionHeight + 24;

  // ---- Footer disclaimer ----
  const generatedOn = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
  const disclaimerLines = wrapText(
    `This is a reference computation based on your Axla data. This is NOT an official BIR printed form. Please validate with eBIRForms before filing. Generated by Axla TaxLaya on ${generatedOn}.`,
    font,
    8,
    CONTENT_WIDTH,
  );
  for (const line of disclaimerLines) {
    page.drawText(line, { x: MARGIN, y, size: 8, font, color: GRAY });
    y -= 11;
  }

  // ---- Free-plan watermark: drawn last (on top), low opacity so the
  // computation underneath stays fully legible. ----
  if (data.isFreePlan) {
    const watermarkText = "DRAFT — AXLA FREE";
    const watermarkSize = 44;
    const textWidth = bold.widthOfTextAtSize(watermarkText, watermarkSize);
    page.drawText(watermarkText, {
      x: PAGE_WIDTH / 2 - textWidth / 2,
      y: 842 / 2,
      size: watermarkSize,
      font: bold,
      color: RED,
      opacity: 0.16,
      rotate: degrees(35),
    });
  }

  return pdfDoc.save();
}
