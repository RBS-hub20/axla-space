import { NextResponse } from "next/server";
import { isAdminRequestAuthorized } from "@/lib/admin";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { isElevenLabsConfigured } from "@/lib/voice/elevenlabs";
import { logError } from "@/lib/log-error";

interface JarvisStats {
  totalUsers: number;
  totalWaitlist: number;
  avgHateLevel: number;
  signupsToday: number;
  messagesToday: number;
  invoicesTotal: number;
  invoicesToday: number;
  invoicesPaidTotal: number;
  invoicesOutstanding: number;
  dtiCount: number;
  secCount: number;
  mayorsCount: number;
  paymongoRevenue: number;
  /** Real business name of Axla's own DTI registration, if one is on file — never fabricated. */
  axlaDtiName: string | null;
}

const JARVIS_EASTER_EGGS = [
  "As you wish, sir.",
  "I've taken the liberty of checking the latest figures.",
  "Systems are at 100 percent, sir. Unlike your sleep schedule.",
];

function maybeEasterEgg(): string {
  // 10% chance, real Math.random() — this runs in a normal Next.js API
  // route, not a workflow script, so there's no determinism constraint here.
  if (Math.random() >= 0.1) return "";
  const line = JARVIS_EASTER_EGGS[Math.floor(Math.random() * JARVIS_EASTER_EGGS.length)];
  return ` ${line}`;
}

function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

/**
 * Simple keyword router today, no OpenAI call — but the shape (gather real
 * `stats` first, then build `answer` from them) is deliberately kept so a
 * later upgrade can swap the template-string step for an LLM call fed the
 * same `stats` object, without touching the data-gathering half.
 */
async function gatherStats(): Promise<JarvisStats> {
  const now = new Date();

  const [
    { count: totalUsers },
    { data: waitlist },
    { data: chatMessages },
    { data: invoices },
    { data: registrations },
    { data: payments },
  ] = await Promise.all([
    supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("waitlist").select("bir_hate_level, created_at"),
    supabaseAdmin.from("chat_messages").select("created_at, message"),
    supabaseAdmin.from("invoices").select("total, status, created_at"),
    supabaseAdmin.from("business_registrations").select("type, data"),
    supabaseAdmin.from("payments").select("amount, status"),
  ]);

  const waitlistRows = waitlist ?? [];
  const avgHateLevel = waitlistRows.length
    ? waitlistRows.reduce((sum, w) => sum + Number(w.bir_hate_level), 0) / waitlistRows.length
    : 0;
  const signupsToday = waitlistRows.filter((w) => isSameDay(new Date(w.created_at), now)).length;

  const chatRows = chatMessages ?? [];
  const messagesToday = chatRows.filter((m) => isSameDay(new Date(m.created_at), now)).length;

  const invoiceRows = invoices ?? [];
  const invoicesToday = invoiceRows.filter((i) => isSameDay(new Date(i.created_at), now)).length;
  const invoicesPaidTotal = invoiceRows.filter((i) => i.status === "paid").reduce((sum, i) => sum + Number(i.total), 0);
  const invoicesOutstanding = invoiceRows.filter((i) => i.status === "sent").reduce((sum, i) => sum + Number(i.total), 0);

  const regRows = registrations ?? [];
  const dtiCount = regRows.filter((r) => r.type === "DTI").length;
  const secCount = regRows.filter((r) => r.type === "SEC").length;
  const mayorsCount = regRows.filter((r) => r.type === "MAYORS").length;

  function dtiBusinessName(row: (typeof regRows)[number]): string {
    const data = row.data as Record<string, unknown>;
    return Array.isArray(data.businessNameOptions) ? String(data.businessNameOptions[0] ?? "") : "";
  }
  const axlaDtiRow = regRows.find((r) => r.type === "DTI" && dtiBusinessName(r).toUpperCase().includes("AXLA"));
  const axlaDtiName = axlaDtiRow ? dtiBusinessName(axlaDtiRow) : null;

  const paymongoRevenue = (payments ?? []).filter((p) => p.status === "paid").reduce((sum, p) => sum + Number(p.amount), 0);

  return {
    totalUsers: totalUsers ?? 0,
    totalWaitlist: waitlistRows.length,
    avgHateLevel: Math.round(avgHateLevel * 10) / 10,
    signupsToday,
    messagesToday,
    invoicesTotal: invoiceRows.length,
    invoicesToday,
    invoicesPaidTotal,
    invoicesOutstanding,
    dtiCount,
    secCount,
    mayorsCount,
    paymongoRevenue,
    axlaDtiName,
  };
}

function buildAnswer(q: string, stats: JarvisStats): string {
  const query = q.toLowerCase();

  if (query.includes("invoice")) {
    return (
      `📄 Invoices: ${stats.invoicesTotal} total (${stats.invoicesToday} today). ` +
      `Paid: PHP ${stats.invoicesPaidTotal.toLocaleString()}. Outstanding: PHP ${stats.invoicesOutstanding.toLocaleString()}.`
    );
  }

  if (query.includes("dti") || query.includes("sec") || query.includes("mayor")) {
    return `🏢 Business Toolkit registrations: DTI ${stats.dtiCount}, SEC ${stats.secCount}, Mayor's Permit ${stats.mayorsCount}.`;
  }

  if (query.includes("hate")) {
    return `🔥 Average BIR hate level: ${stats.avgHateLevel}/10 across ${stats.totalWaitlist} signups.`;
  }

  if (query.includes("revenue") || query.includes("mrr") || query.includes("paymongo")) {
    return (
      `💰 PayMongo revenue: PHP ${stats.paymongoRevenue.toLocaleString()}. Invoices paid: PHP ${stats.invoicesPaidTotal.toLocaleString()}. ` +
      `Combined: PHP ${(stats.paymongoRevenue + stats.invoicesPaidTotal).toLocaleString()}.`
    );
  }

  if (query.includes("today") || query.includes("report")) {
    return (
      `📊 Today's report — Signups: ${stats.signupsToday}, Messages: ${stats.messagesToday}, Invoices: ${stats.invoicesToday}. ` +
      `Totals — Users: ${stats.totalUsers}, Waitlist: ${stats.totalWaitlist}, Avg hate: ${stats.avgHateLevel}/10, ` +
      `Invoices: ${stats.invoicesTotal} (PHP ${stats.invoicesPaidTotal.toLocaleString()} paid), DTI kits: ${stats.dtiCount}.`
    );
  }

  return (
    `👋 Users: ${stats.totalUsers}, Waitlist: ${stats.totalWaitlist} (avg hate ${stats.avgHateLevel}/10), ` +
    `Invoices: ${stats.invoicesTotal}, DTI/SEC/Mayor's kits: ${stats.dtiCount + stats.secCount + stats.mayorsCount}. ` +
    `Try "report today", "invoice report", or "how many DTI?"`
  );
}

/**
 * Same numbers as buildAnswer(), reworded for speech in a Jarvis/British-
 * butler register — no emojis (TTS engines mangle them), full words
 * instead of symbols ("pesos" not "PHP", "out of 10" not "/10"), "sir"
 * instead of "boss". The AXLA DTI line only appears if a real DTI kit with
 * "AXLA" in the business name is actually on file (axlaDtiName) — never
 * asserted when there isn't one, and always says whatever name is really
 * stored rather than a hardcoded string.
 */
function buildVoiceAnswer(q: string, stats: JarvisStats): string {
  const query = q.toLowerCase();
  const egg = maybeEasterEgg();

  if (query.includes("invoice")) {
    return (
      `Sir, you have ${stats.invoicesTotal} invoices total, ${stats.invoicesToday} today. ` +
      `Paid: ${stats.invoicesPaidTotal.toLocaleString()} pesos. Outstanding: ${stats.invoicesOutstanding.toLocaleString()} pesos.${egg}`
    );
  }

  if (query.includes("dti") || query.includes("sec") || query.includes("mayor")) {
    const axlaLine = stats.axlaDtiName ? ` ${stats.axlaDtiName}, certified.` : "";
    return `Business Toolkit registrations, sir: ${stats.dtiCount} D T I, ${stats.secCount} SEC, ${stats.mayorsCount} Mayor's Permit.${axlaLine}${egg}`;
  }

  if (query.includes("hate")) {
    return `The average frustration level is ${stats.avgHateLevel} out of 10, across ${stats.totalWaitlist} signups, sir.${egg}`;
  }

  if (query.includes("revenue") || query.includes("mrr") || query.includes("paymongo")) {
    return (
      `PayMongo revenue stands at ${stats.paymongoRevenue.toLocaleString()} pesos. Invoices paid: ${stats.invoicesPaidTotal.toLocaleString()} pesos. ` +
      `Combined total: ${(stats.paymongoRevenue + stats.invoicesPaidTotal).toLocaleString()} pesos, sir.${egg}`
    );
  }

  const dtiLine = stats.axlaDtiName
    ? `One DTI kit registered — ${stats.axlaDtiName}, certified. `
    : stats.dtiCount > 0
      ? `${stats.dtiCount} D T I kit${stats.dtiCount === 1 ? "" : "s"} on file. `
      : "";

  if (query.includes("today") || query.includes("report")) {
    return (
      `Good evening, sir. We currently have ${stats.totalUsers} users, ${stats.totalWaitlist} on the waitlist with an average ` +
      `frustration level of ${stats.avgHateLevel} out of 10. ${dtiLine}` +
      `${stats.invoicesTotal === 0 ? "No invoices yet." : `${stats.invoicesTotal} invoices on file.`} ` +
      `Today's signups: ${stats.signupsToday}, messages: ${stats.messagesToday}. All systems operational, sir.${egg}`
    );
  }

  const kitTotal = stats.dtiCount + stats.secCount + stats.mayorsCount;
  return (
    `Good evening, sir. We currently have ${stats.totalUsers} users and ${stats.totalWaitlist} on the waitlist, average frustration ` +
    `level ${stats.avgHateLevel} out of 10. ${dtiLine}${stats.invoicesTotal} invoices, ${kitTotal} business toolkit kit${kitTotal === 1 ? "" : "s"} in total. ` +
    `You may ask for a report today, an invoice report, or how many D T I, sir.${egg}`
  );
}

export async function GET(req: Request) {
  if (!(await isAdminRequestAuthorized())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const q = new URL(req.url).searchParams.get("q") ?? "";

  try {
    const stats = await gatherStats();
    const answer = buildAnswer(q, stats);
    const voiceAnswer = buildVoiceAnswer(q, stats);
    return NextResponse.json({ answer, voiceAnswer, stats, elevenLabsConfigured: isElevenLabsConfigured });
  } catch (err) {
    logError("admin/jarvis GET: query failed", err);
    return NextResponse.json({ error: "Jarvis couldn't pull the numbers right now." }, { status: 500 });
  }
}
