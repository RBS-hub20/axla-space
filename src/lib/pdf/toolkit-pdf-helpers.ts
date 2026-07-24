import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

export const PAGE_WIDTH = 595;
export const PAGE_HEIGHT = 842; // A4
export const MARGIN = 40;
export const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export const GREEN = rgb(0, 0.72, 0.4);
export const DARK = rgb(0.08, 0.1, 0.14);
export const GRAY = rgb(0.42, 0.46, 0.52);
export const LIGHT_GRAY_BG = rgb(0.95, 0.96, 0.97);
export const BORDER = rgb(0.85, 0.86, 0.88);
export const RED = rgb(0.75, 0.15, 0.15);
export const AMBER = rgb(0.72, 0.5, 0.05);

export interface ToolkitDoc {
  pdfDoc: PDFDocument;
  page: PDFPage;
  font: PDFFont;
  bold: PDFFont;
  y: number;
}

/** Greedy word-wrap so long fields (address, notes) don't run off the page. */
export function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
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
 * Sets up an A4 page with the shared Axla header — same visual language as
 * generate-form-pdf.ts's reference sheets. `kicker` is the small label in
 * the top-right (e.g. "BUSINESS TOOLKIT — OPEN KIT REFERENCE").
 */
export async function startDoc(kicker: string): Promise<ToolkitDoc> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 800;
  page.drawText("AXLA", { x: MARGIN, y, size: 20, font: bold, color: GREEN });
  page.drawText(" TAXLAYA", { x: MARGIN + font.widthOfTextAtSize("AXLA", 20) + 2, y, size: 20, font: bold, color: DARK });
  const kickerWidth = bold.widthOfTextAtSize(kicker, 9);
  page.drawText(kicker, { x: PAGE_WIDTH - MARGIN - kickerWidth, y: y + 5, size: 9, font: bold, color: GRAY });
  y -= 16;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1.5, color: GREEN });
  y -= 8;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 0.5, color: BORDER });
  y -= 24;

  return { pdfDoc, page, font, bold, y };
}

export function drawSection(doc: ToolkitDoc, title: string, height: number): number {
  doc.page.drawRectangle({
    x: MARGIN,
    y: doc.y - height,
    width: CONTENT_WIDTH,
    height,
    color: LIGHT_GRAY_BG,
    borderColor: BORDER,
    borderWidth: 1,
  });
  doc.page.drawText(title, { x: MARGIN + 12, y: doc.y - 18, size: 10, font: doc.bold, color: DARK });
  doc.y -= 38;
  return doc.y;
}

export function row(doc: ToolkitDoc, label: string, value: string, valueColor = DARK): void {
  doc.page.drawText(label, { x: MARGIN + 12, y: doc.y, size: 9, font: doc.font, color: GRAY });
  const lines = wrapText(value || "—", doc.bold, 9, CONTENT_WIDTH - 202);
  doc.page.drawText(lines[0] ?? "—", { x: MARGIN + 190, y: doc.y, size: 9, font: doc.bold, color: valueColor });
  doc.y -= 18;
  for (const extra of lines.slice(1)) {
    doc.page.drawText(extra, { x: MARGIN + 190, y: doc.y, size: 9, font: doc.bold, color: valueColor });
    doc.y -= 14;
  }
}

/** Body text block — paragraphs and bullet-style checklist lines. */
export function paragraph(doc: ToolkitDoc, text: string, size = 9.5, color = DARK, lineGap = 15): void {
  const lines = wrapText(text, doc.font, size, CONTENT_WIDTH);
  for (const line of lines) {
    doc.page.drawText(line, { x: MARGIN, y: doc.y, size, font: doc.font, color });
    doc.y -= lineGap;
  }
}

export function checklistItem(doc: ToolkitDoc, text: string, checked = false): void {
  doc.page.drawRectangle({
    x: MARGIN,
    y: doc.y - 9,
    width: 10,
    height: 10,
    borderColor: GRAY,
    borderWidth: 1,
    color: checked ? GREEN : undefined,
  });
  const lines = wrapText(text, doc.font, 9.5, CONTENT_WIDTH - 20);
  doc.page.drawText(lines[0] ?? "", { x: MARGIN + 18, y: doc.y, size: 9.5, font: doc.font, color: DARK });
  doc.y -= 16;
  for (const extra of lines.slice(1)) {
    doc.page.drawText(extra, { x: MARGIN + 18, y: doc.y, size: 9.5, font: doc.font, color: DARK });
    doc.y -= 14;
  }
  doc.y -= 2;
}

export function heading(doc: ToolkitDoc, text: string, size = 13): void {
  doc.page.drawText(text, { x: MARGIN, y: doc.y, size, font: doc.bold, color: DARK });
  doc.y -= size + 10;
}

export function spacer(doc: ToolkitDoc, amount = 12): void {
  doc.y -= amount;
}

/**
 * Every generated document gets this footer — the whole reason these are
 * "reference sheets" and not recreations of the actual BIR form/legal
 * instrument: reproducing the real 1901/0605/1905 layout, or a signature-
 * ready SPA, in a way indistinguishable from the genuine article risks
 * someone submitting/relying on it as-is. This makes the boundary explicit
 * on every page, not just the first.
 */
export function drawDisclaimerFooter(doc: ToolkitDoc, text: string): void {
  const footerY = 32;
  doc.page.drawLine({ start: { x: MARGIN, y: footerY + 16 }, end: { x: PAGE_WIDTH - MARGIN, y: footerY + 16 }, thickness: 0.5, color: BORDER });
  const lines = wrapText(text, doc.font, 7.5, CONTENT_WIDTH);
  let fy = footerY;
  for (const line of lines.slice(0, 2)) {
    doc.page.drawText(line, { x: MARGIN, y: fy, size: 7.5, font: doc.font, color: GRAY });
    fy -= 10;
  }
}

export async function finish(doc: ToolkitDoc): Promise<Uint8Array> {
  return doc.pdfDoc.save();
}
