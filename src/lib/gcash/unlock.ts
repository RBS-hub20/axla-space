import "server-only";

// pdfjs-dist's legacy Node build references the browser DOMMatrix global
// unconditionally at module-evaluation time (not just when rendering to a
// canvas) — without it, simply importing the module throws
// "ReferenceError: DOMMatrix is not defined" before any code of ours runs.
// pdfjs's own fallback is to load an optional native canvas package
// (@napi-rs/canvas), but that's a dynamic require() pdfjs makes internally,
// which Vercel's file tracer can't see statically — its native binary gets
// pruned from the deployed function even when listed as a dependency
// (confirmed while building this). A pure-JS DOMMatrix polyfill sidesteps
// the whole native-binary/file-tracing problem, and must be registered
// before pdfjs-dist is imported — a static top-level `import` would be
// hoisted and evaluated first regardless of source order, so pdfjs-dist is
// loaded dynamically below, after the polyfill is in place.
import CSSMatrix from "@thednp/dommatrix";

if (typeof (globalThis as { DOMMatrix?: unknown }).DOMMatrix === "undefined") {
  (globalThis as { DOMMatrix?: unknown }).DOMMatrix = CSSMatrix;
}

type PdfjsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");
let pdfjsPromise: Promise<PdfjsModule> | null = null;
function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) pdfjsPromise = import("pdfjs-dist/legacy/build/pdf.mjs");
  return pdfjsPromise;
}

export class GCashPasswordRequiredError extends Error {
  constructor() {
    super("This PDF is password protected.");
    this.name = "GCashPasswordRequiredError";
  }
}

export class GCashPasswordIncorrectError extends Error {
  constructor() {
    super("Incorrect password.");
    this.name = "GCashPasswordIncorrectError";
  }
}

// pdfjs-dist's own PasswordException codes (PasswordResponses enum).
const NEED_PASSWORD = 1;
const INCORRECT_PASSWORD = 2;

function isPasswordException(err: unknown, code?: number): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { name?: string; code?: number };
  return e.name === "PasswordException" && (code === undefined || e.code === code);
}

interface PdfTextItem {
  str: string;
  transform: number[];
}

/**
 * Reconstructs reading-order lines from pdfjs's flat text-item stream by
 * grouping items with close Y coordinates, then ordering by X within each
 * group — a plain space-join of every item (no position awareness) mixes
 * unrelated columns together on statement-style layouts.
 */
function groupIntoLines(items: PdfTextItem[]): string[] {
  const Y_TOLERANCE = 3;
  const rows: { y: number; parts: { x: number; str: string }[] }[] = [];

  for (const item of items) {
    if (!item.str.trim()) continue;
    const x = item.transform[4];
    const y = item.transform[5];
    let row = rows.find((r) => Math.abs(r.y - y) < Y_TOLERANCE);
    if (!row) {
      row = { y, parts: [] };
      rows.push(row);
    }
    row.parts.push({ x, str: item.str });
  }

  // PDF y-axis increases upward, so descending y is top-to-bottom reading order.
  rows.sort((a, b) => b.y - a.y);
  return rows
    .map((r) =>
      r.parts
        .sort((a, b) => a.x - b.x)
        .map((p) => p.str)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

async function extractLines(bytes: Uint8Array, password?: string): Promise<string[]> {
  const pdfjsLib = await loadPdfjs();
  const loadingTask = pdfjsLib.getDocument({ data: bytes, password });
  const doc = await loadingTask.promise;
  const lines: string[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    lines.push(...groupIntoLines(content.items as PdfTextItem[]));
  }
  await loadingTask.destroy(); // destroy() lives on the loading task, not the resulting PDFDocumentProxy
  return lines;
}

/**
 * Extracts reading-order text lines from a GCash statement PDF, handling
 * GCash's own password-protected export format transparently (their emailed
 * statements are locked with LASTNAME + last 4 digits of the registered
 * mobile number).
 *
 * pdfjs-dist detaches/transfers the Uint8Array it's given on every
 * getDocument() call — reusing the same buffer for a second attempt throws
 * an unrelated "DataCloneError: Cannot transfer object of unsupported type"
 * that looks nothing like a password problem (hit this while building —
 * confirmed by testing against a real encrypted PDF). Every attempt below
 * gets its own fresh `.slice()` copy to avoid that.
 *
 * Order of attempts: no password first (the file might not be encrypted at
 * all), then — only if one was supplied — exactly as typed, then UPPERCASE,
 * then lowercase, since GCash's convention is uppercase but users won't
 * always type it that way.
 */
export async function tryUnlockGCash(bytes: Uint8Array, password?: string): Promise<string[]> {
  try {
    return await extractLines(bytes.slice());
  } catch (err) {
    if (!isPasswordException(err, NEED_PASSWORD)) throw err;
  }

  if (!password) {
    throw new GCashPasswordRequiredError();
  }

  const candidates = Array.from(new Set([password, password.toUpperCase(), password.toLowerCase()]));
  for (const candidate of candidates) {
    try {
      return await extractLines(bytes.slice(), candidate);
    } catch (err) {
      if (!isPasswordException(err, INCORRECT_PASSWORD)) throw err;
    }
  }

  throw new GCashPasswordIncorrectError();
}
