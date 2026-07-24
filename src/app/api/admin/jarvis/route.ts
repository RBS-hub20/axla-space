import { NextResponse } from "next/server";
import { isAdminRequestAuthorized } from "@/lib/admin";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
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
    supabaseAdmin.from("business_registrations").select("type"),
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
 * Same numbers as buildAnswer(), reworded for speech — no emojis (screen
 * readers/TTS engines mangle them), full words instead of symbols ("PHP"
 * spoken, "/10" said as "out of 10"), and a "Hello boss" greeting per spec.
 */
function buildVoiceAnswer(q: string, stats: JarvisStats): string {
  const query = q.toLowerCase();

  if (query.includes("invoice")) {
    return (
      `You have ${stats.invoicesTotal} invoices total, ${stats.invoicesToday} today. ` +
      `Paid: ${stats.invoicesPaidTotal.toLocaleString()} pesos. Outstanding: ${stats.invoicesOutstanding.toLocaleString()} pesos.`
    );
  }

  if (query.includes("dti") || query.includes("sec") || query.includes("mayor")) {
    return `Business Toolkit registrations: ${stats.dtiCount} D T I, ${stats.secCount} SEC, ${stats.mayorsCount} Mayor's Permit.`;
  }

  if (query.includes("hate")) {
    return `Average BIR hate level is ${stats.avgHateLevel} out of 10, across ${stats.totalWaitlist} signups.`;
  }

  if (query.includes("revenue") || query.includes("mrr") || query.includes("paymongo")) {
    return (
      `PayMongo revenue is ${stats.paymongoRevenue.toLocaleString()} pesos. Invoices paid: ${stats.invoicesPaidTotal.toLocaleString()} pesos. ` +
      `Combined total: ${(stats.paymongoRevenue + stats.invoicesPaidTotal).toLocaleString()} pesos.`
    );
  }

  if (query.includes("today") || query.includes("report")) {
    return (
      `Hello boss, we have ${stats.totalUsers} users, ${stats.totalWaitlist} waitlist, with average hate level ${stats.avgHateLevel} out of 10, ` +
      `${stats.invoicesTotal} invoices, ${stats.dtiCount} D T I kit${stats.dtiCount === 1 ? "" : "s"}. ` +
      `Today's signups ${stats.signupsToday}, messages ${stats.messagesToday}.`
    );
  }

  const kitTotal = stats.dtiCount + stats.secCount + stats.mayorsCount;
  return (
    `Hello boss, we have ${stats.totalUsers} users, ${stats.totalWaitlist} waitlist, with average hate level ${stats.avgHateLevel} out of 10, ` +
    `${stats.invoicesTotal} invoices, and ${kitTotal} business toolkit kit${kitTotal === 1 ? "" : "s"}. ` +
    `Try asking for a report today, an invoice report, or how many D T I.`
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
    return NextResponse.json({ answer, voiceAnswer, stats });
  } catch (err) {
    logError("admin/jarvis GET: query failed", err);
    return NextResponse.json({ error: "Jarvis couldn't pull the numbers right now." }, { status: 500 });
  }
}
