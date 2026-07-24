import "server-only";
import {
  startDoc,
  finish,
  drawSection,
  row,
  paragraph,
  checklistItem,
  heading,
  spacer,
  drawQrCode,
  drawDisclaimerFooter,
  DARK,
  AMBER,
} from "./toolkit-pdf-helpers";

const GOV_DISCLAIMER =
  "Axla reference only, not the official government form. Download the official form from dti.gov.ph / sec.gov.ph, or the official LGU checklist at your city hall — requirements/fees change without notice.";

export interface DtiData {
  fullName: string;
  tin: string | null;
  address: string;
  businessNameOptions: [string, string, string];
  businessScope: string;
  capital: number;
}

export async function generateDtiReference(data: DtiData, qrCode: string): Promise<Uint8Array> {
  const doc = await startDoc("BUSINESS TOOLKIT — DTI REFERENCE");
  await drawQrCode(doc, qrCode);
  heading(doc, "DTI Business Name Registration — Reference Sheet");
  paragraph(doc, "Business Name Registration System (BNRS) — registers your business name as a sole proprietor. Not required if you'll operate under your own legal name.");
  spacer(doc);

  let ry = drawSection(doc, "APPLICANT DETAILS", 150);
  doc.y = ry;
  row(doc, "Full Name:", data.fullName);
  row(doc, "TIN:", data.tin || "Not yet issued", data.tin ? DARK : AMBER);
  row(doc, "Address:", data.address);
  row(doc, "Business Scope:", data.businessScope);
  row(doc, "Capital:", `PHP ${data.capital.toLocaleString()}`);
  spacer(doc, 16);

  heading(doc, "Business Name Options (in order of preference)", 11);
  data.businessNameOptions
    .filter((n) => n.trim())
    .forEach((name, i) => checklistItem(doc, `Option ${i + 1}: ${name}`, true));
  spacer(doc, 8);

  heading(doc, "Territorial scope you'll pick on bnrs.dti.gov.ph", 11);
  checklistItem(doc, "Barangay (~PHP 230) — one barangay only");
  checklistItem(doc, "City/Municipality (~PHP 530) — one city/municipality");
  checklistItem(doc, "Regional (~PHP 1,030) — one region");
  checklistItem(doc, "National (~PHP 2,530) — entire Philippines");

  drawDisclaimerFooter(doc, GOV_DISCLAIMER);
  return finish(doc);
}

export async function generateDtiChecklist(data: DtiData): Promise<Uint8Array> {
  const doc = await startDoc("BUSINESS TOOLKIT — DTI CHECKLIST");
  heading(doc, "How to file on bnrs.dti.gov.ph");
  paragraph(doc, `For: ${data.fullName}`);
  spacer(doc);

  heading(doc, "Steps", 11);
  checklistItem(doc, "1. Create an account at bnrs.dti.gov.ph");
  checklistItem(doc, "2. Search your proposed business name(s) for availability first — have 2-3 backups ready");
  checklistItem(doc, "3. Fill out the application: your details, business name, scope of territory, and line of business");
  checklistItem(doc, "4. Review and submit — you'll get a reference number for payment");
  checklistItem(doc, "5. Pay online (GCash/Maya/card) or at any DTI-accredited payment center");
  checklistItem(doc, "6. Download your DTI Certificate once payment is confirmed — usually same-day to a few days");
  spacer(doc, 10);

  heading(doc, "Requirements", 11);
  checklistItem(doc, "Valid government ID");
  checklistItem(doc, "Email address and mobile number for the account");
  checklistItem(doc, "TIN, if you have one already");

  drawDisclaimerFooter(doc, GOV_DISCLAIMER);
  return finish(doc);
}

export async function generateDtiPaymentGuide(data: DtiData): Promise<Uint8Array> {
  const doc = await startDoc("BUSINESS TOOLKIT — DTI PAYMENT GUIDE");
  heading(doc, "Paying your DTI registration");
  spacer(doc, 6);
  paragraph(
    doc,
    `DTI BNRS fees are typically PHP 230-PHP 2,530 depending on territorial scope (barangay to national) — for the ` +
      `${data.businessScope || "scope you selected"}, budget roughly PHP 300-PHP 1,000. Confirm the exact amount on the BNRS payment page before paying, since fees change without notice.`,
  );
  spacer(doc, 10);

  heading(doc, "Paying via GCash", 11);
  checklistItem(doc, "On the BNRS payment page, choose GCash as the payment channel");
  checklistItem(doc, "You'll be redirected to GCash to confirm the exact amount and complete payment");
  checklistItem(doc, "Keep the GCash reference number as your proof of payment");
  spacer(doc, 8);

  heading(doc, "Paying via Maya", 11);
  checklistItem(doc, "Choose Maya (PayMaya) as the payment channel on the same BNRS payment page");
  checklistItem(doc, "Confirm the amount in the Maya app and complete payment");
  checklistItem(doc, "Screenshot the confirmation for your records");

  drawDisclaimerFooter(doc, GOV_DISCLAIMER);
  return finish(doc);
}

export interface Director {
  name: string;
  tin: string;
  address: string;
  shares: number;
}

export interface SecData {
  companyNameOptions: [string, string, string];
  companyType: string;
  numberOfDirectors: number;
  authorizedCapital: number;
  subscribedCapital: number;
  paidUpCapital: number;
  directors: Director[];
}

export async function generateSecArticlesTemplate(data: SecData, qrCode: string): Promise<Uint8Array> {
  const doc = await startDoc("BUSINESS TOOLKIT — AOI TEMPLATE");
  await drawQrCode(doc, qrCode);
  heading(doc, "Articles of Incorporation — Template");
  paragraph(doc, `Draft template for a ${data.companyType}. Fill in the blanks and have counsel review before filing on eSPARC.`);
  spacer(doc);

  heading(doc, "Company Name Options", 11);
  data.companyNameOptions.filter((n) => n.trim()).forEach((name, i) => checklistItem(doc, `Option ${i + 1}: ${name}`, true));
  spacer(doc, 8);

  let ry = drawSection(doc, "CAPITAL STRUCTURE", 96);
  doc.y = ry;
  row(doc, "Authorized Capital:", `PHP ${data.authorizedCapital.toLocaleString()}`);
  row(doc, "Subscribed Capital:", `PHP ${data.subscribedCapital.toLocaleString()}`);
  row(doc, "Paid-up Capital:", `PHP ${data.paidUpCapital.toLocaleString()}`);
  spacer(doc, 16);

  heading(doc, `Directors / Incorporators (${data.directors.length} of ${data.numberOfDirectors} listed)`, 11);
  if (data.directors.length === 0) {
    paragraph(doc, "No directors added yet — add at least one before filing.", 9, AMBER);
  }
  for (const d of data.directors) {
    checklistItem(doc, `${d.name} — TIN ${d.tin || "____"} — ${d.shares.toLocaleString()} shares — ${d.address}`, true);
  }
  spacer(doc, 10);

  paragraph(
    doc,
    "SECOND: That the purpose(s) for which such corporation is incorporated are: [describe primary purpose here].",
    9,
  );
  spacer(doc, 6);
  paragraph(
    doc,
    "IN WITNESS WHEREOF, the incorporators have hereunto affixed their signatures this _____ day of ______________, 20____.",
    9,
  );

  drawDisclaimerFooter(doc, GOV_DISCLAIMER);
  return finish(doc);
}

export async function generateSecBylawsTemplate(data: SecData): Promise<Uint8Array> {
  const doc = await startDoc("BUSINESS TOOLKIT — BY-LAWS TEMPLATE");
  heading(doc, "By-Laws — Template");
  paragraph(doc, `Draft template for a ${data.companyType}. Have counsel review before filing — by-laws govern internal governance and are easy to get wrong.`);
  spacer(doc);

  heading(doc, "ARTICLE I — Board of Directors", 11);
  paragraph(doc, `The corporation shall have a Board of ${data.numberOfDirectors || data.directors.length || "____"} director(s), elected annually by the stockholders.`);
  spacer(doc, 8);
  heading(doc, "ARTICLE II — Officers", 11);
  paragraph(doc, "The officers shall be a President, Corporate Secretary, and Treasurer, elected by the Board from among the directors, except the Corporate Secretary who need not be a director.");
  spacer(doc, 8);
  heading(doc, "ARTICLE III — Meetings", 11);
  paragraph(doc, "Regular stockholders' meetings shall be held annually. Regular board meetings shall be held at least once a month, or as the Board may determine.");
  spacer(doc, 8);
  heading(doc, "ARTICLE IV — Fiscal Year", 11);
  paragraph(doc, "The fiscal year of the corporation shall begin on [month] 1 and end on [month] 30/31 of each year, unless otherwise fixed by the Board.");

  drawDisclaimerFooter(doc, GOV_DISCLAIMER);
  return finish(doc);
}

export async function generateSecCoverSheet(data: SecData): Promise<Uint8Array> {
  const doc = await startDoc("BUSINESS TOOLKIT — COVER SHEET REFERENCE");
  heading(doc, "SEC Cover Sheet — Reference");
  spacer(doc, 6);

  let ry = drawSection(doc, "FILING SUMMARY", 130);
  doc.y = ry;
  row(doc, "Company Type:", data.companyType);
  row(doc, "Primary Name Option:", data.companyNameOptions[0] || "Not set");
  row(doc, "Number of Directors:", String(data.numberOfDirectors || data.directors.length));
  row(doc, "Authorized Capital:", `PHP ${data.authorizedCapital.toLocaleString()}`);
  row(doc, "Documents attached:", "Articles of Incorporation, By-Laws");

  drawDisclaimerFooter(doc, GOV_DISCLAIMER);
  return finish(doc);
}

export async function generateSecEsparcChecklist(): Promise<Uint8Array> {
  const doc = await startDoc("BUSINESS TOOLKIT — ESPARC CHECKLIST");
  heading(doc, "Filing on esparc.sec.gov.ph — Checklist");
  spacer(doc, 6);

  checklistItem(doc, "1. Reserve your company name via the name verification tool first");
  checklistItem(doc, "2. Create an eSPARC account and start a new company registration");
  checklistItem(doc, "3. Upload Articles of Incorporation and By-Laws (use the templates in this kit as your starting draft)");
  checklistItem(doc, "4. Fill out the Cover Sheet and Treasurer's Affidavit fields online");
  checklistItem(doc, "5. Upload director/incorporator IDs and TINs");
  checklistItem(doc, "6. Pay the filing and registration fees (varies by authorized capital)");
  checklistItem(doc, "7. Download your Certificate of Incorporation once approved");
  spacer(doc, 10);

  paragraph(doc, "One Person Corporations (OPC) skip the multiple-incorporator steps but still need a nominee and alternate nominee on file.", 9, AMBER);

  drawDisclaimerFooter(doc, GOV_DISCLAIMER);
  return finish(doc);
}

export type City = "QC" | "Manila" | "Makati" | "Cebu" | "Davao" | "Other";

export interface MayorsData {
  city: City;
  businessName: string;
  address: string;
  natureOfBusiness: string;
}

const CITY_LABELS: Record<City, string> = {
  QC: "Quezon City",
  Manila: "Manila",
  Makati: "Makati",
  Cebu: "Cebu City",
  Davao: "Davao City",
  Other: "your city/municipality",
};

function checklistForCity(city: City): string[] {
  const base = [
    "DTI (sole prop) or SEC Certificate (corp)",
    "BIR Certificate of Registration (Form 2303)",
    "Barangay Clearance",
    "Lease Contract (or land title if owned)",
    "Valid government ID",
  ];
  if (city === "QC") return [...base, "Locational Clearance", "Fire Safety Inspection Certificate"];
  if (city === "Manila") return [...base, "Locational Clearance", "Fire Safety Inspection Certificate", "Sanitary Permit", "Cedula (Community Tax Certificate)"];
  if (city === "Makati") return [...base, "Locational Clearance", "Fire Safety Inspection Certificate", "Zoning Clearance"];
  // Cebu, Davao, Other — generic list; city halls vary enough that specifics need confirming locally.
  return [...base, "Locational/Zoning Clearance (confirm exact name with your city hall)", "Fire Safety Inspection Certificate"];
}

export async function generateMayorsReference(data: MayorsData): Promise<Uint8Array> {
  const doc = await startDoc("BUSINESS TOOLKIT — MAYOR'S PERMIT REFERENCE");
  heading(doc, `Mayor's Permit Application — ${CITY_LABELS[data.city]} Reference`);
  spacer(doc);

  let ry = drawSection(doc, "BUSINESS DETAILS", 100);
  doc.y = ry;
  row(doc, "Business Name:", data.businessName);
  row(doc, "Address:", data.address);
  row(doc, "Nature of Business:", data.natureOfBusiness);
  row(doc, "City:", CITY_LABELS[data.city]);
  spacer(doc, 16);

  heading(doc, "Typical steps", 11);
  checklistItem(doc, "1. Secure Barangay Clearance for your business address first — most cities require this before Business Permits & Licensing accepts your application");
  checklistItem(doc, "2. Submit your Mayor's Permit application with the requirements checklist (see the checklist PDF in this kit)");
  checklistItem(doc, "3. Pay assessed fees (varies by business type, floor area, and declared capital)");
  checklistItem(doc, "4. Claim your Mayor's Permit/Business Permit, usually valid until end of the calendar year, renewable every January");

  drawDisclaimerFooter(doc, GOV_DISCLAIMER);
  return finish(doc);
}

export async function generateBarangayLetter(data: MayorsData): Promise<Uint8Array> {
  const doc = await startDoc("BUSINESS TOOLKIT — BARANGAY REQUEST LETTER");
  heading(doc, "Barangay Clearance Request Letter");
  spacer(doc, 6);
  paragraph(doc, `${new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}`, 9.5, DARK, 14);
  spacer(doc, 10);
  paragraph(doc, "The Barangay Captain", 9.5, DARK, 14);
  spacer(doc, 14);
  paragraph(doc, "Sir/Madam,", 9.5, DARK, 14);
  spacer(doc, 6);
  paragraph(
    doc,
    `I am requesting a Barangay Clearance for my business, "${data.businessName}", located at ${data.address}, engaged in ${data.natureOfBusiness || "the business described above"}. ` +
      `This clearance is needed as a requirement for my Mayor's Permit application with the City of ${CITY_LABELS[data.city]}.`,
    9.5,
    DARK,
    15,
  );
  spacer(doc, 10);
  paragraph(doc, "Thank you for your assistance.", 9.5, DARK, 15);
  spacer(doc, 24);
  paragraph(doc, "Respectfully,", 9.5, DARK, 15);
  spacer(doc, 30);
  doc.page.drawLine({ start: { x: 40, y: doc.y }, end: { x: 220, y: doc.y }, thickness: 0.8, color: DARK });
  spacer(doc, 4);
  paragraph(doc, "Signature over Printed Name", 8, DARK, 12);

  drawDisclaimerFooter(doc, GOV_DISCLAIMER);
  return finish(doc);
}

export async function generateMayorsChecklist(data: MayorsData): Promise<Uint8Array> {
  const doc = await startDoc("BUSINESS TOOLKIT — MAYOR'S CHECKLIST");
  heading(doc, `Requirements Checklist — ${CITY_LABELS[data.city]}`);
  paragraph(doc, `For: ${data.businessName}`);
  spacer(doc);

  for (const item of checklistForCity(data.city)) {
    checklistItem(doc, item);
  }
  spacer(doc, 10);

  if (data.city === "Other" || data.city === "Cebu" || data.city === "Davao") {
    paragraph(
      doc,
      "This is a generic checklist — city hall requirements vary enough that you should confirm the exact list with your city's Business Permits and Licensing Office before your visit.",
      9,
      AMBER,
    );
  }

  drawDisclaimerFooter(doc, GOV_DISCLAIMER);
  return finish(doc);
}
