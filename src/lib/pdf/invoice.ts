import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import QRCode from "qrcode";

const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842; // A4
const MARGIN = 40;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

const DARK = rgb(0.08, 0.1, 0.14);
const GRAY = rgb(0.42, 0.46, 0.52);
const LIGHT_GRAY_BG = rgb(0.95, 0.96, 0.97);
const BORDER = rgb(0.82, 0.84, 0.87);
const GREEN = rgb(0, 0.65, 0.36);

/** Whole-currency amount formatting — WinAnsi (the standard PDF font) can't encode ₱, so "PHP 1,234.00" not "₱1,234.00". */
function money(currency: string, n: number): string {
  return `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export interface InvoiceItem {
  description: string;
  qty: number;
  rate: number;
  amount: number;
}

export interface InvoicePdfData {
  invoiceNumber: string;
  date: string;
  dueDate: string | null;
  paymentTerms: number | null;
  businessName: string;
  businessTin: string | null;
  businessAddress: string | null;
  businessEmail: string | null;
  businessPhone: string | null;
  /** Already-fetched logo bytes (PNG or JPG) — the route fetches from Supabase Storage, this module just embeds. */
  logoBytes: Uint8Array | null;
  clientName: string;
  clientEmail: string | null;
  clientTin: string | null;
  clientAddress: string | null;
  items: InvoiceItem[];
  subtotal: number;
  taxType: "non_vat" | "vat";
  taxAmount: number;
  total: number;
  currency: string;
  notes: string | null;
  paymentDetails: { gcash?: string; maya?: string; bank?: string; showQr?: boolean };
}

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

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
}

/**
 * Professional, white-background, print-ready invoice — deliberately a
 * different visual family from the toolkit's dark-app-matching reference
 * sheets, since this is a document meant to be sent to and printed by a
 * client, not read inside the dashboard.
 */
export async function generateInvoicePDF(data: InvoicePdfData): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  let y = 792;

  // ---- Header: logo + business info ----
  const logoBoxSize = 64;
  if (data.logoBytes) {
    try {
      const isPng = data.logoBytes[0] === 0x89;
      const image = isPng ? await pdfDoc.embedPng(data.logoBytes) : await pdfDoc.embedJpg(data.logoBytes);
      const scale = Math.min(logoBoxSize / image.width, logoBoxSize / image.height);
      page.drawImage(image, { x: MARGIN, y: y - logoBoxSize, width: image.width * scale, height: image.height * scale });
    } catch {
      // Corrupt/unsupported image — fall through to the placeholder box below instead of failing the whole PDF.
      drawLogoPlaceholder(page, bold, MARGIN, y, logoBoxSize);
    }
  } else {
    drawLogoPlaceholder(page, bold, MARGIN, y, logoBoxSize);
  }

  const infoX = MARGIN + logoBoxSize + 16;
  let infoY = y - 4;
  page.drawText(data.businessName, { x: infoX, y: infoY, size: 13, font: bold, color: DARK });
  infoY -= 16;
  if (data.businessTin) {
    page.drawText(`TIN: ${data.businessTin}`, { x: infoX, y: infoY, size: 9, font, color: GRAY });
    infoY -= 13;
  }
  if (data.businessAddress) {
    for (const line of wrapText(data.businessAddress, font, 9, CONTENT_WIDTH - logoBoxSize - 16 - 180)) {
      page.drawText(line, { x: infoX, y: infoY, size: 9, font, color: GRAY });
      infoY -= 12;
    }
  }
  const contactParts = [data.businessEmail, data.businessPhone].filter(Boolean);
  if (contactParts.length) {
    page.drawText(contactParts.join("  |  "), { x: infoX, y: infoY, size: 9, font, color: GRAY });
  }

  // Right-aligned "SERVICE INVOICE" title block
  const titleText = "SERVICE INVOICE";
  const titleWidth = bold.widthOfTextAtSize(titleText, 18);
  page.drawText(titleText, { x: PAGE_WIDTH - MARGIN - titleWidth, y, size: 18, font: bold, color: GREEN });
  const meta = [
    `Invoice #: ${data.invoiceNumber}`,
    `Date: ${formatDate(data.date)}`,
    `Due Date: ${formatDate(data.dueDate)}`,
    data.paymentTerms ? `Terms: Net ${data.paymentTerms} days` : null,
  ].filter(Boolean) as string[];
  let metaY = y - 22;
  for (const line of meta) {
    const w = font.widthOfTextAtSize(line, 9);
    page.drawText(line, { x: PAGE_WIDTH - MARGIN - w, y: metaY, size: 9, font, color: GRAY });
    metaY -= 13;
  }

  y -= logoBoxSize + 24;
  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: BORDER });
  y -= 24;

  // ---- Bill To ----
  page.drawText("BILL TO", { x: MARGIN, y, size: 9, font: bold, color: GRAY });
  y -= 15;
  page.drawText(data.clientName, { x: MARGIN, y, size: 11, font: bold, color: DARK });
  y -= 14;
  if (data.clientEmail) {
    page.drawText(data.clientEmail, { x: MARGIN, y, size: 9, font, color: GRAY });
    y -= 12;
  }
  if (data.clientTin) {
    page.drawText(`TIN: ${data.clientTin}`, { x: MARGIN, y, size: 9, font, color: GRAY });
    y -= 12;
  }
  if (data.clientAddress) {
    for (const line of wrapText(data.clientAddress, font, 9, CONTENT_WIDTH / 2)) {
      page.drawText(line, { x: MARGIN, y, size: 9, font, color: GRAY });
      y -= 12;
    }
  }
  y -= 16;

  // ---- Items table ----
  const colX = { num: MARGIN, desc: MARGIN + 30, qty: PAGE_WIDTH - MARGIN - 180, rate: PAGE_WIDTH - MARGIN - 120, amount: PAGE_WIDTH - MARGIN - 70 };
  const headerHeight = 22;
  page.drawRectangle({ x: MARGIN, y: y - headerHeight, width: CONTENT_WIDTH, height: headerHeight, color: LIGHT_GRAY_BG });
  page.drawText("#", { x: colX.num + 6, y: y - 15, size: 9, font: bold, color: DARK });
  page.drawText("Description", { x: colX.desc, y: y - 15, size: 9, font: bold, color: DARK });
  page.drawText("Qty", { x: colX.qty, y: y - 15, size: 9, font: bold, color: DARK });
  page.drawText("Rate", { x: colX.rate, y: y - 15, size: 9, font: bold, color: DARK });
  page.drawText("Amount", { x: colX.amount, y: y - 15, size: 9, font: bold, color: DARK });
  y -= headerHeight;

  data.items.forEach((item, i) => {
    const descLines = wrapText(item.description, font, 9.5, colX.qty - colX.desc - 10);
    const rowHeight = Math.max(20, descLines.length * 12 + 8);
    if (i % 2 === 1) {
      page.drawRectangle({ x: MARGIN, y: y - rowHeight, width: CONTENT_WIDTH, height: rowHeight, color: LIGHT_GRAY_BG });
    }
    page.drawText(String(i + 1), { x: colX.num + 6, y: y - 14, size: 9.5, font, color: DARK });
    descLines.forEach((line, li) => {
      page.drawText(line, { x: colX.desc, y: y - 14 - li * 12, size: 9.5, font, color: DARK });
    });
    page.drawText(String(item.qty), { x: colX.qty, y: y - 14, size: 9.5, font, color: DARK });
    page.drawText(money(data.currency, item.rate), { x: colX.rate, y: y - 14, size: 9.5, font, color: DARK });
    page.drawText(money(data.currency, item.amount), { x: colX.amount, y: y - 14, size: 9.5, font, color: DARK });
    y -= rowHeight;
  });

  page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_WIDTH - MARGIN, y }, thickness: 1, color: BORDER });
  y -= 20;

  // ---- Totals ----
  const totalsX = PAGE_WIDTH - MARGIN - 200;
  function totalRow(label: string, value: string, size = 9.5, color = DARK, boldFont = false) {
    page.drawText(label, { x: totalsX, y, size, font: boldFont ? bold : font, color });
    const w = (boldFont ? bold : font).widthOfTextAtSize(value, size);
    page.drawText(value, { x: PAGE_WIDTH - MARGIN - w, y, size, font: boldFont ? bold : font, color });
    y -= size + 8;
  }
  totalRow("Subtotal", money(data.currency, data.subtotal));
  if (data.taxType === "vat") {
    totalRow("VAT (12%)", money(data.currency, data.taxAmount));
  } else {
    page.drawText("Non-VAT Registered — No VAT", { x: totalsX, y, size: 8.5, font, color: GRAY });
    y -= 17;
  }
  y -= 4;
  page.drawLine({ start: { x: totalsX, y: y + 6 }, end: { x: PAGE_WIDTH - MARGIN, y: y + 6 }, thickness: 0.75, color: BORDER });
  totalRow("GRAND TOTAL", money(data.currency, data.total), 13, GREEN, true);
  y -= 20;

  // ---- Footer: notes + payment details + QR ----
  const footerTop = y;
  if (data.notes) {
    page.drawText("Notes", { x: MARGIN, y, size: 9, font: bold, color: GRAY });
    y -= 13;
    for (const line of wrapText(data.notes, font, 8.5, CONTENT_WIDTH - 140)) {
      page.drawText(line, { x: MARGIN, y, size: 8.5, font, color: GRAY });
      y -= 11;
    }
    y -= 6;
  }

  const paymentLines: string[] = [];
  if (data.paymentDetails.gcash) paymentLines.push(`GCash: ${data.paymentDetails.gcash}`);
  if (data.paymentDetails.maya) paymentLines.push(`Maya: ${data.paymentDetails.maya}`);
  if (data.paymentDetails.bank) paymentLines.push(`Bank: ${data.paymentDetails.bank}`);
  if (paymentLines.length) {
    page.drawText("Payment Instructions", { x: MARGIN, y, size: 9, font: bold, color: GRAY });
    y -= 13;
    for (const line of paymentLines) {
      page.drawText(line, { x: MARGIN, y, size: 8.5, font, color: GRAY });
      y -= 12;
    }
  }

  if (data.paymentDetails.showQr) {
    const qrSize = 70;
    const qrData = `AXLA-INV-${data.invoiceNumber}`;
    try {
      const qrBuffer = await QRCode.toBuffer(qrData, { type: "png", width: qrSize * 4, margin: 1 });
      const qrImage = await pdfDoc.embedPng(qrBuffer);
      page.drawImage(qrImage, { x: PAGE_WIDTH - MARGIN - qrSize, y: footerTop - qrSize, width: qrSize, height: qrSize });
      page.drawText(qrData, { x: PAGE_WIDTH - MARGIN - qrSize, y: footerTop - qrSize - 11, size: 6.5, font, color: GRAY });
    } catch {
      page.drawRectangle({ x: PAGE_WIDTH - MARGIN - qrSize, y: footerTop - qrSize, width: qrSize, height: qrSize, borderColor: BORDER, borderWidth: 1 });
      page.drawText(`QR: ${qrData}`, { x: PAGE_WIDTH - MARGIN - qrSize, y: footerTop - qrSize / 2, size: 7, font, color: GRAY });
    }
  }

  // ---- Bottom compliance strip ----
  const bottomY = 34;
  page.drawLine({ start: { x: MARGIN, y: bottomY + 18 }, end: { x: PAGE_WIDTH - MARGIN, y: bottomY + 18 }, thickness: 0.5, color: BORDER });
  const complianceLine1 = "EIS-Ready — BIR RR 11-2024 Compliant — Generated by Axla (axla.space)";
  const complianceLine2 = "AXLA SOFTWARE DEVELOPMENT SERVICES — DTI Registered 2026";
  page.drawText(complianceLine1, { x: MARGIN, y: bottomY + 5, size: 7, font, color: GRAY });
  page.drawText(complianceLine2, { x: MARGIN, y: bottomY - 6, size: 7, font, color: GRAY });

  return pdfDoc.save();
}

function drawLogoPlaceholder(page: PDFPage, bold: PDFFont, x: number, y: number, size: number): void {
  page.drawRectangle({
    x,
    y: y - size,
    width: size,
    height: size,
    borderColor: BORDER,
    borderWidth: 1,
    borderDashArray: [4, 3],
  });
  const label = "YOUR LOGO HERE";
  page.drawText(label, { x: x + 6, y: y - size / 2 - 3, size: 6.5, font: bold, color: GRAY, maxWidth: size - 12 });
}
