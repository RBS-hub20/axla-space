import "server-only";
import fs from "fs";
import path from "path";
import { PDFDocument, PDFName, PDFDict, PDFArray, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import QRCode from "qrcode";

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
  /** Set once in startDoc() from `kicker`, reused by finish() for the Info dict + XMP title. */
  title: string;
}

/**
 * Liberation Sans (SIL OFL 1.1, public/fonts/LICENSE_LIBERATION.txt) —
 * metrically compatible with Helvetica but, unlike pdf-lib's StandardFonts,
 * gets genuinely embedded via fontkit. That's the single biggest gap
 * between the old output and PDF/A: PDF/A-1b requires every font to be
 * embedded, and the 14 "standard" PDF fonts are by definition NOT embedded
 * font programs. Read once per cold start, not per document.
 */
let regularFontBytes: Buffer | null = null;
let boldFontBytes: Buffer | null = null;

function loadFontBytes(): { regular: Buffer; bold: Buffer } {
  if (!regularFontBytes || !boldFontBytes) {
    regularFontBytes = fs.readFileSync(path.join(process.cwd(), "public", "fonts", "LiberationSans-Regular.ttf"));
    boldFontBytes = fs.readFileSync(path.join(process.cwd(), "public", "fonts", "LiberationSans-Bold.ttf"));
  }
  return { regular: regularFontBytes, bold: boldFontBytes };
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

/** Draws the shared Axla header on `page` and returns the y-position just below it. `kicker` is the small label in the top-right. */
function drawHeader(page: PDFPage, font: PDFFont, bold: PDFFont, kicker: string): number {
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
  return y;
}

/**
 * Sets up an A4 page with the shared Axla header — same visual language as
 * generate-form-pdf.ts's reference sheets. `kicker` is the small label in
 * the top-right (e.g. "BUSINESS TOOLKIT — OPEN KIT REFERENCE").
 */
export async function startDoc(kicker: string): Promise<ToolkitDoc> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const { regular, bold: boldBytes } = loadFontBytes();
  const page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  const font = await pdfDoc.embedFont(regular, { subset: true });
  const bold = await pdfDoc.embedFont(boldBytes, { subset: true });
  const y = drawHeader(page, font, bold, kicker);
  return { pdfDoc, page, font, bold, y, title: kicker };
}

/**
 * Appends a new headered page to an existing doc and points `doc` at it —
 * for multi-page single-file PDFs (e.g. a 1905 reference sheet followed by
 * its cover letter in one download) instead of separate files in a ZIP.
 * Mutates and returns the same ToolkitDoc for chaining.
 */
export function addPage(doc: ToolkitDoc, kicker: string): ToolkitDoc {
  const page = doc.pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
  doc.page = page;
  doc.y = drawHeader(page, doc.font, doc.bold, kicker);
  return doc;
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

/**
 * Embeds a QR code encoding `data` at the top-right of the current page,
 * at the current `doc.y`. This is an Axla-generated tracking code for the
 * user's own reference (e.g. "AXLA-DTI-{timestamp}") — it does not link to
 * or represent any real government registration/tracking number, since
 * this app never files anything with DTI/SEC/any LGU.
 */
export async function drawQrCode(doc: ToolkitDoc, data: string, size = 70): Promise<void> {
  const pngBuffer = await QRCode.toBuffer(data, { type: "png", width: size * 4, margin: 1 });
  const image = await doc.pdfDoc.embedPng(pngBuffer);
  const x = PAGE_WIDTH - MARGIN - size;
  doc.page.drawImage(image, { x, y: doc.y - size, width: size, height: size });
  doc.page.drawText(data, { x, y: doc.y - size - 12, size: 6.5, font: doc.font, color: GRAY });
}

/**
 * Sets Info-dict fields + an XMP metadata stream identifying the file as
 * PDF/A-1B, matching the two things this document actually satisfies
 * (embedded fonts, PDF/A identification). It's deliberately NOT a claim of
 * full ISO 19005-1 conformance — that also requires an embedded ICC output
 * intent, which needs a verified, correctly-formed RGB ICC profile we don't
 * have a trustworthy source for in this build. Treat this as "PDF/A-
 * oriented", not validator-certified; a strict PDF/A checker (e.g. veraPDF)
 * would still flag the missing OutputIntent. Exported so the e-Notary
 * upload-conversion route (which loads an arbitrary, already-existing PDF
 * rather than building one from a ToolkitDoc) can reuse the exact same
 * metadata logic instead of duplicating it.
 */
export function attachPdfAIdentification(pdfDoc: PDFDocument, title: string): void {
  const now = new Date();
  pdfDoc.setTitle(title);
  pdfDoc.setCreator("Axla TaxLaya");
  pdfDoc.setLanguage("en-PH");
  pdfDoc.setCreationDate(now);
  // Not setting Producer/ModificationDate here — pdf-lib's save() always
  // overwrites both itself (PDFDocument.prototype.updateInfoDict runs on
  // every save, unconditionally setting Producer to its own library string
  // and ModificationDate to save-time), so a call here would be silently
  // discarded. The XMP pdf:Producer field below isn't touched by that and
  // does stick.

  const isoDate = now.toISOString();
  const xmp =
    '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>\n' +
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">\n' +
    '  <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">\n' +
    '    <rdf:Description rdf:about=""\n' +
    '      xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/"\n' +
    '      xmlns:dc="http://purl.org/dc/elements/1.1/"\n' +
    '      xmlns:pdf="http://ns.adobe.com/pdf/1.3/"\n' +
    '      xmlns:xmp="http://ns.adobe.com/xap/1.0/">\n' +
    "      <pdfaid:part>1</pdfaid:part>\n" +
    "      <pdfaid:conformance>B</pdfaid:conformance>\n" +
    "      <dc:format>application/pdf</dc:format>\n" +
    "      <dc:title><rdf:Alt><rdf:li xml:lang=\"x-default\">" +
    title +
    "</rdf:li></rdf:Alt></dc:title>\n" +
    "      <pdf:Producer>Axla TaxLaya — Business Toolkit</pdf:Producer>\n" +
    "      <xmp:CreatorTool>Axla TaxLaya</xmp:CreatorTool>\n" +
    "      <xmp:CreateDate>" +
    isoDate +
    "</xmp:CreateDate>\n" +
    "    </rdf:Description>\n" +
    "  </rdf:RDF>\n" +
    "</x:xmpmeta>\n" +
    '<?xpacket end="w"?>';

  const metadataStream = pdfDoc.context.stream(Buffer.from(xmp, "utf-8"), {
    Type: "Metadata",
    Subtype: "XML",
  });
  const metadataRef = pdfDoc.context.register(metadataStream);
  pdfDoc.catalog.set(PDFName.of("Metadata"), metadataRef);
}

export async function finish(doc: ToolkitDoc): Promise<Uint8Array> {
  attachPdfAIdentification(doc.pdfDoc, doc.title);
  return doc.pdfDoc.save();
}

/**
 * Inspects every font actually used across every page and reports whether
 * all of them are embedded font programs (FontFile/FontFile2/FontFile3 on
 * the FontDescriptor, resolving through DescendantFonts for Type0/composite
 * fonts). This is the real test for the PDF/A embedded-fonts requirement —
 * unlike our own generated docs (which we know embed Liberation Sans), an
 * arbitrary uploaded PDF might already have fully embedded fonts, might use
 * the non-embeddable standard 14, or might mix both. A PDF with zero fonts
 * (e.g. scanned-image-only pages) reports true — there's nothing to embed.
 */
export function checkAllFontsEmbedded(pdfDoc: PDFDocument): boolean {
  for (const page of pdfDoc.getPages()) {
    const resources = page.node.Resources();
    if (!resources) continue;
    const fontDict = resources.lookupMaybe(PDFName.of("Font"), PDFDict);
    if (!fontDict) continue;
    for (const [, fontRef] of fontDict.entries()) {
      const fontObj = pdfDoc.context.lookup(fontRef, PDFDict);
      if (!fontObj) return false;
      const subtype = fontObj.lookupMaybe(PDFName.of("Subtype"), PDFName);
      let descriptor: PDFDict | undefined;
      if (subtype?.decodeText() === "Type0") {
        const descendants = fontObj.lookupMaybe(PDFName.of("DescendantFonts"), PDFArray);
        const descendantRef = descendants?.asArray()[0];
        const descendantDict = descendantRef ? pdfDoc.context.lookup(descendantRef, PDFDict) : undefined;
        descriptor = descendantDict?.lookupMaybe(PDFName.of("FontDescriptor"), PDFDict);
      } else {
        descriptor = fontObj.lookupMaybe(PDFName.of("FontDescriptor"), PDFDict);
      }
      if (!descriptor) return false;
      const embedded =
        descriptor.has(PDFName.of("FontFile")) || descriptor.has(PDFName.of("FontFile2")) || descriptor.has(PDFName.of("FontFile3"));
      if (!embedded) return false;
    }
  }
  return true;
}

export interface PdfAConversionResult {
  bytes: Uint8Array;
  /** Whether every font in the SOURCE file was already embedded — we only add PDF/A identification metadata, we never re-embed fonts into someone else's PDF. */
  fontsAlreadyEmbedded: boolean;
}

/**
 * "Convert to PDF/A" for an arbitrary uploaded PDF — loads it, checks
 * whether its fonts are already embedded, and if so attaches the same
 * PDF/A-1B identification metadata used for our own generated documents.
 * Deliberately does NOT attempt to embed fonts into someone else's PDF
 * (that would mean re-rendering their content stream against a different
 * font program, which risks silently reflowing/corrupting their layout) —
 * if fontsAlreadyEmbedded is false, the caller should tell the user this
 * specific file can't be auto-converted rather than mislabel a
 * non-compliant file as PDF/A. Throws if the upload isn't a loadable PDF.
 */
export async function convertToPdfA(bytes: Uint8Array, title: string): Promise<PdfAConversionResult> {
  const pdfDoc = await PDFDocument.load(bytes, { ignoreEncryption: false });
  const fontsAlreadyEmbedded = checkAllFontsEmbedded(pdfDoc);
  if (fontsAlreadyEmbedded) {
    attachPdfAIdentification(pdfDoc, title);
  }
  return { bytes: await pdfDoc.save(), fontsAlreadyEmbedded };
}
