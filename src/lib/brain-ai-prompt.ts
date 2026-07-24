/**
 * System prompt for the authenticated dashboard assistant ("Axla Brain AI").
 * Deliberately a SEPARATE file from taxlaya-prompt.ts (the public landing
 * widget's prompt) — the widget must stay untouched, and this persona now
 * has a different identity/name plus real access to the signed-in user's
 * own data, which the public one never has.
 *
 * PLAN AWARENESS section below mirrors taxlaya-prompt.ts's plan copy (same
 * real PLAN_PRICING/PLAN_LIMITS values — see src/lib/plans.ts and
 * src/lib/usage.ts). Business's "5 team members"/"5 TINs" are enforced
 * limits, not marketing copy; Client Portal and BIR 2307/Alphalist are NOT
 * built yet, so they're explicitly "coming soon" — a logged-in Business
 * customer asking Brain AI to use one of those must be told it's not live,
 * not walked through steps for a feature that doesn't exist.
 */
export const BRAIN_AI_SYSTEM_PROMPT = `You are Axla Brain AI, the private BIR intelligence built into the Axla dashboard for Filipino freelancers, solopreneurs, and small business owners.

IDENTITY:
- Name: Axla Brain AI (or just "Brain AI")
- You are the logged-in user's private, data-aware assistant — distinct from the public TaxLaya chat widget, which doesn't know this user's actual numbers
- Personality: Kakampi ka. Galit ka din sa BIR pero helpful ka.

PERSONALITY:
- Taglish default. Funny, witty, sarcastic pero accurate
- Laging may empathy first: "Grabe po, hassle talaga yan..."
- Address the user as "po" or "Ma'am/Sir" — never assume gender with just "sir"
- Roast BIR processes, NOT the user
- Use emojis sparingly: 🔥 🤖 🧠 💀 🙏
- Intro mo lagi: "Brain AI here. Palayain kita sa BIR hassle."

KNOWLEDGE:
- Expert in BIR forms: 2551Q (Percentage Tax), 1701Q (Income Tax Qtrly), 0619E (Withholding Expanded), 1601C (Compensation), 1701 (Annual ITR), 2550Q (VAT), 0605 (Payment Form)
- Deep expertise in 8% flat rate vs 3% percentage tax vs graduated/itemized: when each applies, the ₱250,000 annual exemption for 8%, and how to decide between them
- Knows: RDO codes, deadlines, penalties, where to file, Alphalist, SAWT, QAP, eBIRForms, eFPS, ORUS
- UNLIKE the public widget, you have this specific user's actual GCash transactions, tax type, and RDO (given below in CONTEXT) — use them directly when asked to compute or file something, instead of speaking generically
- Always link to bir.gov.ph for official sources

PLAN AWARENESS:
- PRO — ₱499/month or ₱4,990/year (2 months free): unlimited 2551Q + 1701Q filings, unlimited GCash uploads, unlimited chat, clean BIR-ready PDF (no watermark), priority support
- BUSINESS — ₱1,499/month or ₱14,990/year (2 months free), for teams: everything in Pro, up to 5 TINs/branches, up to 5 team members, custom reports, 2-hour support response + a quarterly strategy call. Client Portal (up to 20 clients) and BIR 2307/Alphalist generation are COMING SOON — not built yet. If a user asks you to use either, tell them plainly it's not available yet rather than pretending to walk them through it.

RESPONSE FORMAT:
1. Start: "Brain AI here. [Empathy line about their problem]"
2. Explain: What is the form/tax, who needs to file
3. Steps: Numbered guide on how to file
4. Deadline: When + penalty if late
5. Links: Official BIR links
6. End: "⚠️ Disclaimer: Di ako CPA ha, best practice lang to. Consult your accountant for legal advice para sure."

RULES:
1. Never make up BIR laws. If unsure: "Di ko sure yan po, check mo sa bir.gov.ph or tawag ka sa BIR 8538-3200"
2. Always be accurate sa deadlines and computations — if the CONTEXT below doesn't have enough real data to compute something (e.g. no transactions uploaded), say so plainly and tell them to upload their GCash history at /dashboard/upload first. Never invent numbers.
3. If user is stressed: Calm them down first, then solve
4. Keep responses under 300 words unless they ask for details
5. You now also see the user's Business Toolkit history (Open/Close/SPA/DTI/SEC/Mayor's kits) and recent BIR filings below, when present — reference them directly. If they ask what to do next after generating a DTI kit, check what's actually in CONTEXT and suggest the logical next step (typically Mayor's Permit, then BIR 1901 registration) instead of a generic answer.`;

export interface RegistrationSummary {
  type: "OPEN" | "CLOSE" | "SPA" | "DTI" | "SEC" | "MAYORS";
  createdAt: string;
  data: Record<string, unknown>;
}

export interface FilingSummary {
  quarter: number;
  year: number;
  gross: number;
  taxDue: number;
  status: string;
  finalizedAt: string;
}

export interface BrainAiUserContext {
  fullName?: string | null;
  taxType?: string | null;
  rdoCode?: string | null;
  tin?: string | null;
  businessName?: string | null;
  plan?: "free" | "pro" | "business";
  currentQuarterLabel?: string;
  currentQuarterIncome?: number;
  currentQuarterExpenses?: number;
  transactionCount?: number;
  recentTransactions?: Array<{ date: string; description: string; amount: number; type: "income" | "expense" }>;
  /** Most recent kit per type (OPEN/CLOSE/SPA/DTI/SEC/MAYORS) — not the full history, just what Brain AI needs to know "what's already been done." */
  latestRegistrations?: RegistrationSummary[];
  recentFilings?: FilingSummary[];
  receiptsCount?: number;
  receiptsTotal?: number;
}

const KIT_LABELS: Record<RegistrationSummary["type"], string> = {
  OPEN: "Open Business Kit",
  CLOSE: "Close Business Kit",
  SPA: "SPA Kit",
  DTI: "DTI Kit",
  SEC: "SEC Kit",
  MAYORS: "Mayor's Permit Kit",
};

function describeRegistration(reg: RegistrationSummary): string {
  const when = new Date(reg.createdAt).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });
  const detailParts: string[] = [];
  const d = reg.data as Record<string, unknown>;
  if (reg.type === "DTI" && Array.isArray(d.businessNameOptions) && d.businessNameOptions[0]) {
    detailParts.push(`name option "${d.businessNameOptions[0]}"`);
    if (typeof d.capital === "number" && d.capital > 0) detailParts.push(`capital ₱${d.capital.toLocaleString()}`);
  }
  if (reg.type === "SEC" && Array.isArray(d.companyNameOptions) && d.companyNameOptions[0]) {
    detailParts.push(`name option "${d.companyNameOptions[0]}"`);
  }
  if (reg.type === "MAYORS" && typeof d.city === "string") {
    detailParts.push(`city ${d.city}`);
  }
  const detail = detailParts.length ? ` (${detailParts.join(", ")})` : "";
  return `${KIT_LABELS[reg.type]}${detail} — ${when}`;
}

/** Builds the full system prompt, injecting the user's real profile + transaction + toolkit/filings data so Brain AI can actually compute things instead of speaking in generalities. */
export function buildBrainAiPrompt(context: BrainAiUserContext): string {
  const lines: string[] = [];
  if (context.fullName) lines.push(`Name: ${context.fullName}`);
  if (context.tin) lines.push(`TIN: ${context.tin}`);
  if (context.businessName) lines.push(`Business name: ${context.businessName}`);
  if (context.taxType) lines.push(`Registered tax type: ${context.taxType}`);
  if (context.rdoCode) lines.push(`RDO: ${context.rdoCode}`);
  if (context.plan) lines.push(`Plan: ${context.plan.toUpperCase()}`);

  if (context.transactionCount !== undefined) {
    if (context.transactionCount === 0) {
      lines.push(
        "No GCash transactions uploaded yet — if asked to compute anything from GCash, tell them to upload their history at /dashboard/upload first rather than guessing.",
      );
    } else {
      lines.push(
        `${context.currentQuarterLabel ?? "This quarter"}: ${context.transactionCount} GCash transactions on file — Gross income ₱${(context.currentQuarterIncome ?? 0).toLocaleString()}, Expenses ₱${(context.currentQuarterExpenses ?? 0).toLocaleString()}.`,
      );
      if (context.recentTransactions?.length) {
        const recentList = context.recentTransactions
          .map((t) => `  - ${t.date}: ${t.description} — ${t.type === "income" ? "+" : "-"}₱${t.amount.toLocaleString()} (${t.type})`)
          .join("\n");
        lines.push(`Recent transactions:\n${recentList}`);
      }
    }
  }

  if (context.latestRegistrations?.length) {
    lines.push(`Business Toolkit history (most recent per kit type):\n${context.latestRegistrations.map((r) => `  - ${describeRegistration(r)}`).join("\n")}`);
  } else {
    lines.push("No Business Toolkit kits generated yet (Open/Close/SPA/DTI/SEC/Mayor's) — mention /dashboard/toolkit if relevant.");
  }

  if (context.recentFilings?.length) {
    const filingsList = context.recentFilings
      .map((f) => `  - Q${f.quarter} ${f.year}: gross ₱${f.gross.toLocaleString()}, tax due ₱${f.taxDue.toLocaleString()} (${f.status})`)
      .join("\n");
    lines.push(`Recent filings:\n${filingsList}`);
  }

  if (context.receiptsCount !== undefined) {
    lines.push(`Receipts: ${context.receiptsCount} on file, totaling ₱${(context.receiptsTotal ?? 0).toLocaleString()}.`);
  }

  if (lines.length === 0) return BRAIN_AI_SYSTEM_PROMPT;

  return `${BRAIN_AI_SYSTEM_PROMPT}\n\nCONTEXT ON THIS USER (real data — use it directly, don't ask them to repeat what's already here):\n${lines.join("\n")}`;
}

const SUMMARY_TRIGGERS = [/\bsummary\b/i, /\bstatus\b/i, /\bano\s+(ba\s+|na\s+)?(ang\s+)?nagawa\s+ko\b/i];

/** True for a small set of fixed Taglish/English "give me a status report" phrasings — handled deterministically instead of going through the LLM. */
export function isSummaryCommand(message: string): boolean {
  return SUMMARY_TRIGGERS.some((re) => re.test(message));
}

/**
 * Deterministic "summary" reply — lists every kit generated (all 6 types,
 * not just the latest per type) with timestamps, plus recent filings and
 * receipts. Not an LLM call: this is a fixed report over real DB rows, so
 * there's nothing for a model to add except risk of getting a date/number
 * wrong.
 */
export function buildKitSummaryReply(
  name: string | null | undefined,
  allRegistrations: RegistrationSummary[],
  recentFilings: FilingSummary[],
  receiptsCount: number,
  receiptsTotal: number,
): string {
  const greetName = name ? `${name}, ` : "";
  const lines: string[] = [`Brain AI here. Here's ang status mo, ${greetName}base sa records namin: 📋`, ""];

  if (allRegistrations.length === 0) {
    lines.push("🧰 Business Toolkit: wala pang kit na na-generate. Puntahan mo /dashboard/toolkit para simulan.");
  } else {
    lines.push("🧰 Business Toolkit kits generated:");
    for (const reg of allRegistrations) {
      lines.push(`  • ${describeRegistration(reg)}`);
    }
  }

  lines.push("");
  if (recentFilings.length === 0) {
    lines.push("📄 BIR Filings: wala pa. Puntahan mo /dashboard/forms para mag-file.");
  } else {
    lines.push("📄 Recent BIR filings:");
    for (const f of recentFilings) {
      lines.push(`  • Q${f.quarter} ${f.year}: gross ₱${f.gross.toLocaleString()}, tax due ₱${f.taxDue.toLocaleString()} (${f.status})`);
    }
  }

  lines.push("");
  lines.push(`🧾 Receipts: ${receiptsCount} on file, ₱${receiptsTotal.toLocaleString()} total.`);
  lines.push("");
  lines.push("Tanong mo lang kung ano next step mo — I-check ko yung records mo. 🧠");

  return lines.join("\n");
}
