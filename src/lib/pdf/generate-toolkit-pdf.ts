import "server-only";
import {
  startDoc,
  addPage,
  finish,
  drawSection,
  row,
  paragraph,
  checklistItem,
  heading,
  spacer,
  drawDisclaimerFooter,
  GREEN,
  RED,
  AMBER,
  DARK,
} from "./toolkit-pdf-helpers";

const REFERENCE_DISCLAIMER =
  "This is an AXLA reference sheet, not the official BIR form — it summarizes what to fill in so the real form (available at bir.gov.ph or your RDO) is accurate the first time. Requirements/fees vary by RDO — confirm before your visit.";
const LEGAL_DISCLAIMER =
  "Template only. This document is not legally binding until properly executed — for the SPA, that means notarization. Have a lawyer or notary review before signing/using.";

export interface OpenKitData {
  fullName: string;
  tin: string | null;
  rdoCode: string | null;
  businessName: string;
  address: string;
  businessType: "freelance" | "sole-prop";
}

export async function generateOpen1901Reference(data: OpenKitData): Promise<Uint8Array> {
  const doc = await startDoc("BUSINESS TOOLKIT — 1901 REFERENCE");
  heading(doc, "BIR Form 1901 — Registration Reference Sheet");
  paragraph(doc, "Application for Registration (self-employed individual / mixed income earner).");
  spacer(doc);

  let ry = drawSection(doc, "TAXPAYER DETAILS", 160);
  doc.y = ry;
  row(doc, "Full Name:", data.fullName);
  row(doc, "TIN:", data.tin || "Not yet issued — apply at RDO if new", data.tin ? DARK : AMBER);
  row(doc, "RDO Code:", data.rdoCode || "Confirm your RDO by address", data.rdoCode ? DARK : AMBER);
  row(doc, "Business Name:", data.businessName || data.fullName);
  row(doc, "Business Address:", data.address);
  row(doc, "Registration Type:", data.businessType === "freelance" ? "Professional / Self-Employed" : "Sole Proprietorship");
  spacer(doc, 16);

  heading(doc, "Fields you'll fill on the actual 1901", 11);
  checklistItem(doc, "Line 1-2: Taxpayer's name, exactly as on a valid government ID");
  checklistItem(doc, "Line 5: RDO code — the RDO covering your registered address");
  checklistItem(doc, "Part II: Registration type — check 'Self-Employed' for freelance/professional income");
  checklistItem(doc, "Part IV: Business name and complete address");
  checklistItem(doc, "Part V: Line of business / PSIC code — match your actual work (e.g. software dev, consulting)");
  checklistItem(doc, "Signature over printed name, with date");

  drawDisclaimerFooter(doc, REFERENCE_DISCLAIMER);
  return finish(doc);
}

export async function generateOpen0605Reference(data: OpenKitData): Promise<Uint8Array> {
  const doc = await startDoc("BUSINESS TOOLKIT — 0605 REFERENCE");
  heading(doc, "BIR Form 0605 — Registration Fee Reference Sheet");
  paragraph(doc, "Payment Form used for the one-time PHP 500 Annual Registration Fee (ATC: RF — Registration Fee) plus the PHP 30 Documentary Stamp Tax on the Certificate of Registration, typically paid at registration and every January after.");
  spacer(doc);

  let ry = drawSection(doc, "TAXPAYER DETAILS", 118);
  doc.y = ry;
  row(doc, "Full Name:", data.fullName);
  row(doc, "TIN:", data.tin || "Not yet issued", data.tin ? DARK : AMBER);
  row(doc, "RDO Code:", data.rdoCode || "Confirm at RDO", data.rdoCode ? DARK : AMBER);
  row(doc, "Tax Type:", "Registration Fee (RF)");
  spacer(doc, 16);

  heading(doc, "Fields you'll fill on the actual 0605", 11);
  checklistItem(doc, "Item 1: RDO code");
  checklistItem(doc, "Item 4: TIN");
  checklistItem(doc, "Item 12: Tax Type = RF (Registration Fee)");
  checklistItem(doc, "Item 20: Amount = PHP 500.00 (confirm current rate — this can change)");
  checklistItem(doc, "Pay via Authorized Agent Bank, GCash, or ePay channel your RDO accepts");

  drawDisclaimerFooter(doc, REFERENCE_DISCLAIMER);
  return finish(doc);
}

export async function generateOpenChecklist(data: OpenKitData): Promise<Uint8Array> {
  const doc = await startDoc("BUSINESS TOOLKIT — OPEN CHECKLIST");
  heading(doc, "Ano dadalhin sa RDO — Opening Checklist");
  paragraph(doc, `For: ${data.fullName} — ${data.businessName || data.fullName}`);
  spacer(doc);

  checklistItem(doc, "Valid government ID (original + photocopy)");
  checklistItem(doc, "DTI Certificate of Business Name Registration (if using a business name, not your own name)");
  checklistItem(doc, "Barangay Certificate / Business Permit (if your RDO/LGU requires it before BIR registration)");
  checklistItem(doc, "Accomplished BIR Form 1901 (2 copies)");
  checklistItem(doc, "Accomplished BIR Form 0605 + proof of payment (PHP 500 registration fee + PHP 30 DST)");
  checklistItem(doc, "Books of accounts to register (manual ledger/journal, or request Computerized Accounting System permit later)");
  checklistItem(doc, "Sample Official Receipt / Invoice layout, for Authority to Print (ATP) application");
  checklistItem(doc, "Proof of address (lease contract or utility bill, if renting)");

  drawDisclaimerFooter(doc, REFERENCE_DISCLAIMER);
  return finish(doc);
}

export async function generateOpenScript(data: OpenKitData): Promise<Uint8Array> {
  const doc = await startDoc("BUSINESS TOOLKIT — RDO SCRIPT");
  heading(doc, "Ano sasabihin sa BIR officer — Opening a Business");
  paragraph(doc, "Taglish script — adjust to how you naturally talk. This is a guide, hindi kailangan sundin word-for-word.");
  spacer(doc);

  heading(doc, "1. Pagdating sa counter", 11);
  paragraph(doc, `"Magandang araw po. Magpaparehistro po sana ako ng bagong business, self-employed / professional po, hindi employed. Ito po yung mga documents ko — 1901, 0605, at valid ID."`);
  spacer(doc, 8);

  heading(doc, "2. Kapag tinanong ng line of business", 11);
  paragraph(doc, `Sabihin nang specific — halimbawa: "Freelance web development po" o "Online selling po ng [product]" — hindi lang "self-employed" kasi kailangan nila ng PSIC code na tugma.`);
  spacer(doc, 8);

  heading(doc, "3. Kapag tinanong tungkol sa books of accounts", 11);
  paragraph(doc, `"Manual books po muna — ledger at journal." Pwede mo ring itanong: "Kailangan ko na po ba i-register yung Official Receipts ngayon, o pwede next visit?"`);
  spacer(doc, 8);

  heading(doc, "4. Bago umalis", 11);
  paragraph(doc, `Kumpirmahin: "Ano pong susunod na deadline ko para sa filing?" at "May contact number po ba ako pwede tawagan kung may tanong?"`);

  drawDisclaimerFooter(doc, REFERENCE_DISCLAIMER);
  return finish(doc);
}

export interface AuthorizedRepData {
  fullName: string;
  relationship: string;
  validId: string;
  contactNo: string;
}

export interface CloseKitData extends OpenKitData {
  closureReason: string;
  lastFilingDate: string | null;
  authorizedRep: AuthorizedRepData | null;
}

export async function generateClose1905Reference(data: CloseKitData): Promise<Uint8Array> {
  const doc = await startDoc("BUSINESS TOOLKIT — 1905 REFERENCE");
  heading(doc, "BIR Form 1905 — Business Closure Reference Sheet");
  paragraph(doc, "Application for Registration Information Update / Correction / Cancellation. Section for cancellation of TIN/business registration applies here.");
  spacer(doc);

  let ry = drawSection(doc, "TAXPAYER DETAILS", 178);
  doc.y = ry;
  row(doc, "Full Name:", data.fullName);
  row(doc, "TIN:", data.tin || "Not set", data.tin ? DARK : RED);
  row(doc, "RDO Code:", data.rdoCode || "Not set", data.rdoCode ? DARK : AMBER);
  row(doc, "Business Name:", data.businessName || data.fullName);
  row(doc, "Reason for Closure:", data.closureReason || "Not specified");
  row(doc, "Last Filing Date:", data.lastFilingDate || "Not specified");
  spacer(doc, 16);

  heading(doc, "Fields you'll fill on the actual 1905", 11);
  checklistItem(doc, "Part I: Taxpayer identification — TIN, RDO, registered name");
  checklistItem(doc, "Part II: Check the box for 'Cancellation of Registration'");
  checklistItem(doc, "Reason for cancellation — cessation of business, per your closureReason above");
  checklistItem(doc, "Attach: original Certificate of Registration (Form 2303) for surrender");
  checklistItem(doc, "Attach: inventory of unused official receipts/invoices");
  checklistItem(doc, "Signature over printed name, with date");

  drawDisclaimerFooter(doc, REFERENCE_DISCLAIMER);
  return finish(doc);
}

export async function generateCloseLetter(data: CloseKitData): Promise<Uint8Array> {
  const doc = await startDoc("BUSINESS TOOLKIT — LETTER OF INTENT");
  heading(doc, "Letter of Intent to Close Business");
  spacer(doc, 6);
  paragraph(doc, `${new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}`, 9.5, DARK, 14);
  spacer(doc, 10);
  paragraph(doc, "The Revenue District Officer", 9.5, DARK, 14);
  paragraph(doc, `RDO ${data.rdoCode || "____"}`, 9.5, DARK, 14);
  spacer(doc, 14);
  paragraph(doc, "Sir/Madam,", 9.5, DARK, 14);
  spacer(doc, 6);
  paragraph(
    doc,
    `I, ${data.fullName}, TIN ${data.tin || "____________"}, registered under the business name "${data.businessName || data.fullName}" ` +
      `located at ${data.address}, am writing to formally notify your office of my intent to cease business operations and cancel my ` +
      `registration, effective as of my last filing on ${data.lastFilingDate || "the date indicated in my attached BIR Form 1905"}.`,
    9.5,
    DARK,
    15,
  );
  spacer(doc, 8);
  paragraph(
    doc,
    `Reason for closure: ${data.closureReason || "Cessation of business operations."}`,
    9.5,
    DARK,
    15,
  );
  spacer(doc, 8);
  paragraph(
    doc,
    "I have attached the accomplished BIR Form 1905, my original Certificate of Registration (2303) for surrender, and an inventory of unused official receipts/invoices. I request confirmation of my registration cancellation and any final requirements to complete this process.",
    9.5,
    DARK,
    15,
  );
  spacer(doc, 8);
  paragraph(doc, "Thank you for your assistance.", 9.5, DARK, 15);
  spacer(doc, 24);
  paragraph(doc, "Respectfully,", 9.5, DARK, 15);
  spacer(doc, 30);
  doc.page.drawLine({ start: { x: 40, y: doc.y }, end: { x: 220, y: doc.y }, thickness: 0.8, color: DARK });
  spacer(doc, 4);
  paragraph(doc, data.fullName, 9.5, DARK, 14);
  paragraph(doc, "Signature over Printed Name", 8, DARK, 12);

  drawDisclaimerFooter(doc, LEGAL_DISCLAIMER);
  return finish(doc);
}

export async function generateCloseChecklist(data: CloseKitData): Promise<Uint8Array> {
  const doc = await startDoc("BUSINESS TOOLKIT — CLOSE CHECKLIST");
  heading(doc, "Closing without penalties — Checklist");
  paragraph(doc, `For: ${data.fullName} — ${data.businessName || data.fullName}`);
  spacer(doc);

  checklistItem(doc, "Settle all open/pending BIR cases and penalties FIRST — an open case can get your closure application denied");
  checklistItem(doc, "File all outstanding returns up to your last day of operation (percentage/income tax, any pending quarters)");
  checklistItem(doc, "Accomplished BIR Form 1905 (cancellation section)");
  checklistItem(doc, "Letter of Intent to Close Business (generated alongside this checklist)");
  checklistItem(doc, "Original Certificate of Registration (BIR Form 2303) for surrender");
  checklistItem(doc, "Books of accounts, presented for terminal stamping");
  checklistItem(doc, "Inventory list of unused official receipts/invoices, for cancellation");
  checklistItem(doc, "Valid government ID");
  if (data.authorizedRep) {
    checklistItem(doc, "Authorization Letter + Rep's valid ID + photocopy of owner ID");
  }
  checklistItem(doc, "If using a Special Power of Attorney (SPA) — original + photocopy, notarized");

  drawDisclaimerFooter(doc, REFERENCE_DISCLAIMER);
  return finish(doc);
}

export async function generateCloseGuide(data: CloseKitData): Promise<Uint8Array> {
  const doc = await startDoc("BUSINESS TOOLKIT — RDO GUIDE");
  heading(doc, "Step-by-step sa RDO — Closing a Business");
  spacer(doc, 6);

  heading(doc, "1. Bago pumunta", 11);
  paragraph(doc, "Siguraduhing wala kang open cases o unpaid penalties — pwede itong sanhi ng pagtanggi sa closure mo. I-check muna sa BIR Guard kung meron ka pang open case.");
  spacer(doc, 8);
  heading(doc, "2. Sa RDO counter", 11);
  paragraph(doc, `"Magandang araw po. Magsasara po ako ng business, TIN ${data.tin || "____"}, RDO ${data.rdoCode || "____"}. Nandito po yung 1905, letter of intent, at 2303 ko for surrender."`);
  spacer(doc, 8);
  heading(doc, "3. Books at ORs", 11);
  paragraph(doc, "Dadalhin mo ang books of accounts para i-stamp na 'terminated', at ang listahan ng unused ORs/invoices para i-cancel.");
  spacer(doc, 8);
  heading(doc, "4. Pagkatapos", 11);
  paragraph(doc, "Hihingi ka ng acknowledgment/confirmation na na-receive ang application. Itanong: \"Ilang araw po bago ma-confirm yung closure, at may tax clearance po ba akong kukunin?\"");

  drawDisclaimerFooter(doc, REFERENCE_DISCLAIMER);
  return finish(doc);
}

/**
 * Simple non-notarized authorization letter for closure — distinct from the
 * SPA template below (generateSpaDocument), which is a heavier, notarized
 * instrument for OFWs/full remote representation. This is for the common
 * "my employee/relative will just drop off the papers at the RDO" case.
 * Only called when the caller has confirmed data.authorizedRep is set.
 */
export async function generateAuthorizationLetter(data: CloseKitData): Promise<Uint8Array> {
  const rep = data.authorizedRep;
  const doc = await startDoc("BUSINESS TOOLKIT — AUTHORIZATION LETTER");
  heading(doc, "Authorization Letter", 15);
  spacer(doc, 6);
  paragraph(
    doc,
    `Date: ${data.lastFilingDate || new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}`,
    9.5,
    DARK,
    14,
  );
  spacer(doc, 10);
  paragraph(doc, "To: The Revenue District Officer", 9.5, DARK, 14);
  paragraph(doc, `BIR RDO ${data.rdoCode || "____"}`, 9.5, DARK, 14);
  spacer(doc, 14);
  paragraph(
    doc,
    `I, ${data.fullName}, Filipino, of legal age, with TIN ${data.tin || "____________"}, owner of "${data.businessName || data.fullName}", ` +
      `located at ${data.address}, do hereby authorize:`,
    9.5,
    DARK,
    15,
  );
  spacer(doc, 8);
  paragraph(
    doc,
    `${rep?.fullName || "____________"}, ${rep?.relationship || "____________"}, with ID ${rep?.validId || "____________"}` +
      `${rep?.contactNo ? `, contact ${rep.contactNo}` : ""}`,
    9.5,
    DARK,
    15,
  );
  spacer(doc, 8);
  paragraph(
    doc,
    `To process, file, and claim documents related to the closure/cessation of my business registration at BIR RDO ${data.rdoCode || "____"}.`,
    9.5,
    DARK,
    15,
  );
  spacer(doc, 8);
  paragraph(doc, "This authorization includes submitting BIR Form 1905, Letter of Intent, and other related documents.", 9.5, DARK, 15);
  spacer(doc, 8);
  paragraph(doc, "Attached: Photocopy of my valid ID and representative's valid ID.", 9.5, DARK, 15);
  spacer(doc, 30);

  const colWidth = 250;
  doc.page.drawLine({ start: { x: 40, y: doc.y }, end: { x: 40 + colWidth, y: doc.y }, thickness: 0.8, color: DARK });
  doc.page.drawLine({ start: { x: 40 + colWidth + 20, y: doc.y }, end: { x: 40 + colWidth * 2 + 20, y: doc.y }, thickness: 0.8, color: DARK });
  doc.y -= 14;
  doc.page.drawText(data.fullName, { x: 40, y: doc.y, size: 9, font: doc.bold, color: DARK });
  doc.page.drawText(rep?.fullName || "", { x: 40 + colWidth + 20, y: doc.y, size: 9, font: doc.bold, color: DARK });
  doc.y -= 12;
  doc.page.drawText("Owner Signature", { x: 40, y: doc.y, size: 8, font: doc.font, color: DARK });
  doc.page.drawText("Authorized Rep Signature", { x: 40 + colWidth + 20, y: doc.y, size: 8, font: doc.font, color: DARK });

  drawDisclaimerFooter(doc, LEGAL_DISCLAIMER);
  return finish(doc);
}

export interface SpaData {
  principalName: string;
  principalTin: string | null;
  principalAddress: string;
  representativeName: string;
  representativeAddress: string;
  relationship: string;
  rdoCode: string | null;
  scope: {
    closeBusiness: boolean;
    surrenderBooks: boolean;
    getCor: boolean;
    fileReturns: boolean;
  };
}

function scopeLines(scope: SpaData["scope"]): string[] {
  const lines: string[] = [];
  if (scope.closeBusiness) lines.push("To file and process the closure/cancellation of my business registration with the BIR;");
  if (scope.surrenderBooks) lines.push("To surrender my books of accounts and unused official receipts/invoices for cancellation;");
  if (scope.getCor) lines.push("To request, receive, and sign for my Certificate of Registration (BIR Form 2303) and related documents;");
  if (scope.fileReturns) lines.push("To prepare, sign, and file tax returns and payment forms on my behalf, and to receive any related correspondence;");
  if (lines.length === 0) lines.push("To represent me in dealings with the Bureau of Internal Revenue as described below;");
  return lines;
}

export async function generateSpaDocument(data: SpaData): Promise<Uint8Array> {
  const doc = await startDoc("BUSINESS TOOLKIT — SPA TEMPLATE");
  heading(doc, "Special Power of Attorney", 15);
  paragraph(doc, "KNOW ALL MEN BY THESE PRESENTS:", 9.5, DARK, 15);
  spacer(doc, 6);
  paragraph(
    doc,
    `I, ${data.principalName}${data.principalTin ? `, TIN ${data.principalTin}` : ""}, of legal age, with address at ` +
      `${data.principalAddress}, do hereby name, constitute, and appoint ${data.representativeName} (${data.relationship}), ` +
      `of address at ${data.representativeAddress}, as my true and lawful attorney-in-fact, for me and in my name, place, and stead, ` +
      `to do and perform the following acts before the Bureau of Internal Revenue, RDO ${data.rdoCode || "____"}:`,
    9.5,
    DARK,
    15,
  );
  spacer(doc, 10);
  for (const line of scopeLines(data.scope)) {
    checklistItem(doc, line, true);
  }
  spacer(doc, 6);
  paragraph(
    doc,
    "HEREBY GIVING AND GRANTING unto my said attorney-in-fact full power and authority to do and perform every act necessary to accomplish " +
      "the foregoing as fully as I might or could do if personally present, hereby ratifying and confirming all that my attorney-in-fact shall lawfully do by virtue hereof.",
    9.5,
    DARK,
    15,
  );
  spacer(doc, 20);
  paragraph(doc, `Signed this _____ day of ______________, 20____, at ______________________.`, 9.5, DARK, 15);
  spacer(doc, 30);

  const colWidth = 250;
  doc.page.drawLine({ start: { x: 40, y: doc.y }, end: { x: 40 + colWidth, y: doc.y }, thickness: 0.8, color: DARK });
  doc.page.drawLine({ start: { x: 40 + colWidth + 20, y: doc.y }, end: { x: 40 + colWidth * 2 + 20, y: doc.y }, thickness: 0.8, color: DARK });
  doc.y -= 14;
  doc.page.drawText(data.principalName, { x: 40, y: doc.y, size: 9, font: doc.bold, color: DARK });
  doc.page.drawText(data.representativeName, { x: 40 + colWidth + 20, y: doc.y, size: 9, font: doc.bold, color: DARK });
  doc.y -= 12;
  doc.page.drawText("Principal", { x: 40, y: doc.y, size: 8, font: doc.font, color: DARK });
  doc.page.drawText("Attorney-in-Fact / Representative", { x: 40 + colWidth + 20, y: doc.y, size: 8, font: doc.font, color: DARK });

  doc.y -= 40;
  const notaryHeight = 130;
  drawSection(doc, "ACKNOWLEDGMENT (Notary Public use only)", notaryHeight);
  doc.y -= 8;
  paragraph(doc, "Republic of the Philippines )", 8.5, DARK, 13);
  paragraph(doc, "City/Province of ________________ ) S.S.", 8.5, DARK, 13);
  spacer(doc, 6);
  paragraph(
    doc,
    "BEFORE ME, a Notary Public for and in the above jurisdiction, personally appeared the above-named Principal, known to me and identified through competent evidence of identity, who executed the foregoing Special Power of Attorney and acknowledged the same to be their free and voluntary act.",
    8,
    DARK,
    12,
  );
  spacer(doc, 10);
  paragraph(doc, "Doc. No. _____   Page No. _____   Book No. _____   Series of 20____", 8.5, DARK, 12);

  drawDisclaimerFooter(doc, LEGAL_DISCLAIMER);
  return finish(doc);
}

export async function generateSpaCoverLetter(data: SpaData): Promise<Uint8Array> {
  const doc = await startDoc("BUSINESS TOOLKIT — RDO COVER LETTER");
  heading(doc, "RDO Packet Cover Letter");
  spacer(doc, 6);
  paragraph(doc, `${new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}`, 9.5, DARK, 14);
  spacer(doc, 10);
  paragraph(doc, `The Revenue District Officer, RDO ${data.rdoCode || "____"}`, 9.5, DARK, 14);
  spacer(doc, 14);
  paragraph(doc, "Sir/Madam,", 9.5, DARK, 14);
  spacer(doc, 6);
  paragraph(
    doc,
    `This letter accompanies documents I am submitting through my duly authorized representative, ${data.representativeName} (${data.relationship}), ` +
      `on behalf of ${data.principalName}${data.principalTin ? `, TIN ${data.principalTin}` : ""}, currently based abroad / unable to appear in person. ` +
      `A notarized Special Power of Attorney is attached authorizing this representation.`,
    9.5,
    DARK,
    15,
  );
  spacer(doc, 10);
  heading(doc, "Enclosed:", 10.5);
  checklistItem(doc, "Notarized Special Power of Attorney (original + photocopy)", true);
  checklistItem(doc, "Valid government ID of Principal (photocopy)", true);
  checklistItem(doc, "Valid government ID of Representative (original + photocopy)", true);
  if (data.scope.closeBusiness) checklistItem(doc, "BIR Form 1905 (cancellation) and Letter of Intent to Close Business", true);
  if (data.scope.surrenderBooks) checklistItem(doc, "Books of accounts and inventory of unused receipts/invoices", true);

  spacer(doc, 10);
  paragraph(doc, "I would appreciate your assistance in processing the above through my representative. Thank you.", 9.5, DARK, 15);
  spacer(doc, 20);
  paragraph(doc, "Respectfully,", 9.5, DARK, 15);
  spacer(doc, 26);
  doc.page.drawLine({ start: { x: 40, y: doc.y }, end: { x: 220, y: doc.y }, thickness: 0.8, color: DARK });
  spacer(doc, 4);
  paragraph(doc, data.principalName, 9.5, DARK, 14);

  drawDisclaimerFooter(doc, LEGAL_DISCLAIMER);
  return finish(doc);
}

export async function generateSpaNotaryGuide(): Promise<Uint8Array> {
  const doc = await startDoc("BUSINESS TOOLKIT — NOTARY GUIDE");
  heading(doc, "Saan magpa-notaryo — Guide");
  spacer(doc, 6);
  paragraph(doc, "Notarization fees in the Philippines are set per notary/law office — PHP 100 is common for a straightforward SPA but isn't fixed by law, so treat it as a rough starting point, not a guaranteed rate.");
  spacer(doc, 10);

  heading(doc, "Saan hanapin", 11);
  checklistItem(doc, "Law offices malapit sa city hall o hall of justice — madalas may notary public");
  checklistItem(doc, "Ilang municipal/city hall ang may notary services on-site");
  checklistItem(doc, "Online notarization services (video call-based) — tanungin muna kung tinatanggap ng iyong RDO ang e-notarized documents");
  spacer(doc, 10);

  heading(doc, "Dalhin", 11);
  checklistItem(doc, "Original valid government ID (hindi expired)");
  checklistItem(doc, "Ang SPA document na kumpleto na ang laman, pero HUWAG pa pipirmahan bago dumating sa notary — pipirmahan sa harap niya");
  checklistItem(doc, "Kung available, ang representative rin — mas mabilis kung parehong pipirma sa harap ng notary, pero kung nasa abroad ang principal, may ibang paraan (consularized/apostilled document) na dapat gamitin — tanungin sa Philippine Embassy/Consulate kung paano");
  spacer(doc, 10);

  paragraph(
    doc,
    "Mahalaga: kung ang principal ay nasa ibang bansa, hindi na ordinary notarization ang gagamitin — kailangan ng consularized o apostilled na document mula sa Philippine Embassy/Consulate o local notary sa bansang kinaroroonan (depende kung apostille-member ang bansa). Tanungin agad sa embahada para sa tamang proseso.",
    9,
    RED,
    14,
  );

  drawDisclaimerFooter(doc, LEGAL_DISCLAIMER);
  return finish(doc);
}

export interface RdoTransferData {
  fullName: string;
  businessName: string;
  tin: string | null;
  address: string;
  fromRdoCode: string;
  fromRdoName: string;
  toRdoCode: string;
  toRdoName: string;
  checklist: { label: string; checked: boolean }[];
}

/**
 * BIR Guard — RDO Transfer. A single two-page PDF (not a ZIP): page 1 is
 * the 1905 reference sheet, page 2 the application letter — everything
 * pulled from the caller's profile + saved RDO Transfer draft, no manual
 * fields. See src/app/api/bir-guard/rdo-transfer/generate/route.ts, which
 * refuses to call this at all if required profile fields are missing
 * (banner + link to Settings) rather than falling back to a form here.
 */
export async function generateRdoTransferPdf(data: RdoTransferData): Promise<Uint8Array> {
  const doc = await startDoc("BIR GUARD — RDO TRANSFER — 1905 REFERENCE");
  heading(doc, "BIR Form 1905 — RDO Transfer Reference Sheet");
  paragraph(doc, "Application for Registration Information Update — Transfer of Registration (Change of RDO).");
  spacer(doc);

  const ry = drawSection(doc, "TAXPAYER DETAILS", 178);
  doc.y = ry;
  row(doc, "Full Name:", data.fullName);
  row(doc, "TIN:", data.tin || "Not set", data.tin ? DARK : RED);
  row(doc, "Business Name:", data.businessName || data.fullName);
  row(doc, "Registered Address:", data.address);
  row(doc, "From RDO:", data.fromRdoCode ? `RDO ${data.fromRdoCode} - ${data.fromRdoName}` : "Not set", data.fromRdoCode ? DARK : RED);
  row(doc, "To RDO:", data.toRdoCode ? `RDO ${data.toRdoCode} - ${data.toRdoName}` : "Not set", data.toRdoCode ? DARK : RED);
  spacer(doc, 16);

  heading(doc, "Fields you'll fill on the actual 1905", 11);
  checklistItem(doc, "Part I: Taxpayer identification — TIN, current RDO, registered name");
  checklistItem(doc, "Part II: Check the box for 'Transfer of Registration/Home RDO'");
  checklistItem(doc, `New RDO: RDO ${data.toRdoCode || "____"} - ${data.toRdoName || "____"}`);
  checklistItem(doc, "Reason for transfer — change of business/residence address");
  checklistItem(doc, "Attach: original Certificate of Registration (Form 2303) for annotation");
  checklistItem(doc, "Signature over printed name, with date");

  drawDisclaimerFooter(doc, REFERENCE_DISCLAIMER);

  addPage(doc, "BIR GUARD — RDO TRANSFER — APPLICATION LETTER");
  heading(doc, "Application Letter for Transfer of Registration");
  spacer(doc, 6);
  paragraph(doc, new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }), 9.5, DARK, 14);
  spacer(doc, 10);
  paragraph(doc, "The Revenue District Officer", 9.5, DARK, 14);
  paragraph(doc, data.toRdoCode ? `RDO ${data.toRdoCode} - ${data.toRdoName}` : "____", 9.5, DARK, 14);
  spacer(doc, 14);
  paragraph(doc, "Sir/Madam,", 9.5, DARK, 14);
  spacer(doc, 6);
  paragraph(
    doc,
    `I, ${data.fullName}, TIN ${data.tin || "____________"}, registered under the business name "${data.businessName || data.fullName}" ` +
      `located at ${data.address}, am writing to formally request the transfer of my registration records from ` +
      `${data.fromRdoCode ? `RDO ${data.fromRdoCode} - ${data.fromRdoName}` : "my current RDO"} to ` +
      `${data.toRdoCode ? `RDO ${data.toRdoCode} - ${data.toRdoName}` : "the receiving RDO"}, pursuant to BIR Form 1905.`,
    9.5,
    DARK,
    15,
  );
  spacer(doc, 8);
  paragraph(doc, "Attached to this letter:", 9.5, DARK, 15);
  spacer(doc, 4);
  const attached = data.checklist.filter((item) => item.checked);
  if (attached.length === 0) {
    checklistItem(doc, "Accomplished BIR Form 1905", true);
  } else {
    for (const item of attached) checklistItem(doc, item.label, true);
  }
  spacer(doc, 8);
  paragraph(doc, "I request confirmation of receipt and any further requirements needed to complete this transfer.", 9.5, DARK, 15);
  spacer(doc, 8);
  paragraph(doc, "Thank you for your assistance.", 9.5, DARK, 15);
  spacer(doc, 24);
  paragraph(doc, "Respectfully,", 9.5, DARK, 15);
  spacer(doc, 30);
  doc.page.drawLine({ start: { x: 40, y: doc.y }, end: { x: 220, y: doc.y }, thickness: 0.8, color: DARK });
  spacer(doc, 4);
  paragraph(doc, data.fullName, 9.5, DARK, 14);
  paragraph(doc, "Signature over Printed Name", 8, DARK, 12);

  drawDisclaimerFooter(doc, LEGAL_DISCLAIMER);
  return finish(doc);
}
