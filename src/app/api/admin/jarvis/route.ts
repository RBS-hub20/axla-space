import { NextResponse } from "next/server";
import { isAdminRequestAuthorized } from "@/lib/admin";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { isElevenLabsConfigured, JARVIS_VOICE_ID, FRIDAY_VOICE_ID } from "@/lib/voice/elevenlabs";
import { getManilaGreeting, formatManilaTime, formatManilaDate } from "@/lib/manila-time";
import { getBirDeadlines, type BirDeadline } from "@/lib/bir-deadlines";
import { logError } from "@/lib/log-error";

type Persona = "jarvis" | "friday";

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
  "As you wish, Boss.",
  "I've taken the liberty of checking, Boss.",
  "Systems at 100 percent, Boss. Unlike your sleep schedule, Boss — just kidding.",
  "At your service, Boss.",
  "Anything else, Boss?",
];

const FRIDAY_EASTER_EGGS = ["Got it, Boss!", "On it, Boss!", "You got it, Boss!"];

function maybeEasterEgg(persona: Persona): string {
  // 10% chance, real Math.random() — this runs in a normal Next.js API
  // route, not a workflow script, so there's no determinism constraint here.
  if (Math.random() >= 0.1) return "";
  const eggs = persona === "friday" ? FRIDAY_EASTER_EGGS : JARVIS_EASTER_EGGS;
  return ` ${eggs[Math.floor(Math.random() * eggs.length)]}`;
}

function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

function formatDeadlineDate(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

/** Spoken summary of the most urgent deadlines — never invents a number, just describes real computed daysLeft/status. */
function buildBirVoiceSummary(deadlines: BirDeadline[]): string {
  const overdue = deadlines.filter((d) => d.status === "OVERDUE");
  const urgent = deadlines.filter((d) => d.status === "WARNING");

  if (overdue.length > 0) {
    const names = overdue.map((d) => `${d.name.split(" ")[0]} (${Math.abs(d.daysLeft)} days overdue)`).join(", ");
    return `Boss, you have ${overdue.length} overdue filing${overdue.length === 1 ? "" : "s"}: ${names}. Let's get on that.`;
  }
  if (urgent.length === 0) {
    return "No overdue or urgent BIR deadlines this week, Boss. All good.";
  }
  const parts = urgent.map((d) => `${d.name.split(" ")[0]} on ${formatDeadlineDate(d.date)}, ${d.daysLeft} day${d.daysLeft === 1 ? "" : "s"} left`);
  return `Quick BIR check, Boss — you have ${urgent.length} deadline${urgent.length === 1 ? "" : "s"} this week: ${parts.join(", and ")}. No overdue, Boss. All good.`;
}

/**
 * Simple keyword router today, no OpenAI call — but the shape (gather real
 * `stats` first, then build `answer`/`voiceAnswer` from them) is
 * deliberately kept so a later upgrade can swap the template-string step
 * for an LLM call fed the same `stats` object, without touching the
 * data-gathering half.
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

/** Text-display answer (with emojis) — always addresses the admin as "Boss" too, just tersely. */
function buildAnswer(q: string, stats: JarvisStats, deadlines: BirDeadline[]): string {
  const query = q.toLowerCase();

  if (query.includes("bir") || query.includes("deadline")) {
    const lines = deadlines
      .map((d) => `${d.status === "OVERDUE" ? "🔴" : d.status === "WARNING" ? "⚠️" : "🟢"} ${d.name}: ${formatDeadlineDate(d.date)} (${d.daysLeft}d)`)
      .join(" | ");
    return `📅 Boss, BIR deadlines: ${lines}`;
  }

  if (query.includes("invoice")) {
    return (
      `📄 Boss, invoices: ${stats.invoicesTotal} total (${stats.invoicesToday} today). ` +
      `Paid: PHP ${stats.invoicesPaidTotal.toLocaleString()}. Outstanding: PHP ${stats.invoicesOutstanding.toLocaleString()}.`
    );
  }

  if (query.includes("dti") || query.includes("sec") || query.includes("mayor")) {
    return `🏢 Boss, Business Toolkit registrations: DTI ${stats.dtiCount}, SEC ${stats.secCount}, Mayor's Permit ${stats.mayorsCount}.`;
  }

  if (query.includes("hate")) {
    return `🔥 Boss, average BIR hate level: ${stats.avgHateLevel}/10 across ${stats.totalWaitlist} signups.`;
  }

  if (query.includes("revenue") || query.includes("mrr") || query.includes("paymongo")) {
    return (
      `💰 Boss, PayMongo revenue: PHP ${stats.paymongoRevenue.toLocaleString()}. Invoices paid: PHP ${stats.invoicesPaidTotal.toLocaleString()}. ` +
      `Combined: PHP ${(stats.paymongoRevenue + stats.invoicesPaidTotal).toLocaleString()}.`
    );
  }

  if (query.includes("today") || query.includes("report")) {
    return (
      `📊 Boss, today's report — Signups: ${stats.signupsToday}, Messages: ${stats.messagesToday}, Invoices: ${stats.invoicesToday}. ` +
      `Totals — Users: ${stats.totalUsers}, Waitlist: ${stats.totalWaitlist}, Avg hate: ${stats.avgHateLevel}/10, ` +
      `Invoices: ${stats.invoicesTotal} (PHP ${stats.invoicesPaidTotal.toLocaleString()} paid), DTI kits: ${stats.dtiCount}.`
    );
  }

  return (
    `👋 Boss, Users: ${stats.totalUsers}, Waitlist: ${stats.totalWaitlist} (avg hate ${stats.avgHateLevel}/10), ` +
    `Invoices: ${stats.invoicesTotal}, DTI/SEC/Mayor's kits: ${stats.dtiCount + stats.secCount + stats.mayorsCount}. ` +
    `Try "report today", "invoice report", or "how many DTI?"`
  );
}

/**
 * Same numbers as buildAnswer(), reworded for speech, split by persona:
 * Jarvis (formal butler) vs FRIDAY (upbeat, casual) — both always call the
 * admin "Boss", never "sir". No emojis (TTS engines mangle them), full
 * words instead of symbols ("pesos" not "PHP", "out of 10" not "/10"). The
 * AXLA DTI line only appears if a real DTI kit with "AXLA" in the business
 * name is actually on file (axlaDtiName) — never asserted when there
 * isn't one, and always says whatever name is really stored rather than a
 * hardcoded string.
 */
function buildVoiceAnswer(q: string, stats: JarvisStats, persona: Persona, deadlines: BirDeadline[], greeting: string): string {
  const query = q.toLowerCase();
  const egg = maybeEasterEgg(persona);
  const isFriday = persona === "friday";

  if (query.includes("bir") || query.includes("deadline")) {
    return `${buildBirVoiceSummary(deadlines)}${egg}`;
  }

  if (query.includes("invoice")) {
    return isFriday
      ? `Boss! You've got ${stats.invoicesTotal} invoices total, ${stats.invoicesToday} today. Paid: ${stats.invoicesPaidTotal.toLocaleString()} pesos. Outstanding: ${stats.invoicesOutstanding.toLocaleString()} pesos.${egg}`
      : `Boss, you have ${stats.invoicesTotal} invoices total, ${stats.invoicesToday} today. Paid: ${stats.invoicesPaidTotal.toLocaleString()} pesos. Outstanding: ${stats.invoicesOutstanding.toLocaleString()} pesos.${egg}`;
  }

  if (query.includes("dti") || query.includes("sec") || query.includes("mayor")) {
    const axlaLine = stats.axlaDtiName ? ` ${stats.axlaDtiName}, certified.` : "";
    return isFriday
      ? `Business Toolkit check, Boss: ${stats.dtiCount} D T I, ${stats.secCount} SEC, ${stats.mayorsCount} Mayor's Permit.${axlaLine}${egg}`
      : `Business Toolkit registrations, Boss: ${stats.dtiCount} D T I, ${stats.secCount} SEC, ${stats.mayorsCount} Mayor's Permit.${axlaLine}${egg}`;
  }

  if (query.includes("hate")) {
    return `The average frustration level is ${stats.avgHateLevel} out of 10, across ${stats.totalWaitlist} signups, Boss.${egg}`;
  }

  if (query.includes("revenue") || query.includes("mrr") || query.includes("paymongo")) {
    return (
      `PayMongo revenue stands at ${stats.paymongoRevenue.toLocaleString()} pesos, Boss. Invoices paid: ${stats.invoicesPaidTotal.toLocaleString()} pesos. ` +
      `Combined total: ${(stats.paymongoRevenue + stats.invoicesPaidTotal).toLocaleString()} pesos.${egg}`
    );
  }

  const dtiLine = stats.axlaDtiName
    ? `One DTI kit registered — ${stats.axlaDtiName}, certified. `
    : stats.dtiCount > 0
      ? `${stats.dtiCount} D T I kit${stats.dtiCount === 1 ? "" : "s"} on file. `
      : "";

  const urgentDeadlines = deadlines.filter((d) => d.status !== "OK");
  const deadlineMention =
    urgentDeadlines.length > 0
      ? ` Heads up, Boss: ${urgentDeadlines.length} BIR deadline${urgentDeadlines.length === 1 ? "" : "s"} need${urgentDeadlines.length === 1 ? "s" : ""} attention this week.`
      : "";

  if (query.includes("today") || query.includes("report")) {
    return isFriday
      ? `${greeting}, Boss! FRIDAY here. We have ${stats.totalUsers} users, ${stats.totalWaitlist} waitlist, average hate ${stats.avgHateLevel}. ` +
          `${dtiLine}${stats.invoicesTotal === 0 ? "No invoices yet." : `${stats.invoicesTotal} invoices on file.`} ` +
          `Today: ${stats.signupsToday} signups, ${stats.messagesToday} messages.${deadlineMention} All good, Boss!${egg}`
      : `${greeting}, Boss. We currently have ${stats.totalUsers} users, ${stats.totalWaitlist} on the waitlist with an average ` +
          `frustration level of ${stats.avgHateLevel} out of 10. ${dtiLine}` +
          `${stats.invoicesTotal === 0 ? "No invoices yet." : `${stats.invoicesTotal} invoices on file.`} ` +
          `Today's signups: ${stats.signupsToday}, messages: ${stats.messagesToday}.${deadlineMention} All systems operational, Boss.${egg}`;
  }

  const kitTotal = stats.dtiCount + stats.secCount + stats.mayorsCount;
  return isFriday
    ? `${greeting}, Boss! FRIDAY here. We have ${stats.totalUsers} users and ${stats.totalWaitlist} waitlist, average hate ${stats.avgHateLevel}. ` +
        `${dtiLine}${stats.invoicesTotal} invoices, ${kitTotal} toolkit kit${kitTotal === 1 ? "" : "s"} total.${deadlineMention} ` +
        `Ask me for a report today, an invoice report, or how many D T I, Boss!${egg}`
    : `${greeting}, Boss. We currently have ${stats.totalUsers} users and ${stats.totalWaitlist} on the waitlist, average frustration ` +
        `level ${stats.avgHateLevel} out of 10. ${dtiLine}${stats.invoicesTotal} invoices, ${kitTotal} business toolkit kit${kitTotal === 1 ? "" : "s"} in total.${deadlineMention} ` +
        `You may ask for a report today, an invoice report, or how many D T I, Boss.${egg}`;
}

export async function GET(req: Request) {
  if (!(await isAdminRequestAuthorized())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 403 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? "";
  const persona: Persona = url.searchParams.get("persona") === "friday" ? "friday" : "jarvis";

  try {
    const now = new Date();
    const stats = await gatherStats();
    const deadlines = getBirDeadlines(now);
    const { greeting } = getManilaGreeting(now);
    const answer = buildAnswer(q, stats, deadlines);
    const voiceAnswer = buildVoiceAnswer(q, stats, persona, deadlines, greeting);
    return NextResponse.json({
      answer,
      voiceAnswer,
      stats,
      birDeadlines: deadlines,
      greeting,
      manilaTime: formatManilaTime(now),
      manilaDate: formatManilaDate(now),
      elevenLabsConfigured: isElevenLabsConfigured,
      voiceId: persona === "friday" ? FRIDAY_VOICE_ID : JARVIS_VOICE_ID,
    });
  } catch (err) {
    logError("admin/jarvis GET: query failed", err);
    return NextResponse.json({ error: "Jarvis couldn't pull the numbers right now." }, { status: 500 });
  }
}
