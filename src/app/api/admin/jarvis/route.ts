import { NextResponse } from "next/server";
import { isAdminRequestAuthorized } from "@/lib/admin";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { isElevenLabsConfigured, JARVIS_VOICE_ID, FRIDAY_VOICE_ID } from "@/lib/voice/elevenlabs";
import { getManilaGreeting, formatManilaTime, formatManilaDate, type ManilaGreeting } from "@/lib/manila-time";
import { getBirDeadlines, type BirDeadline } from "@/lib/bir-deadlines";
import { reconcilePayments, findExpiringSoon, type ExpiringSubscriber } from "@/lib/payments-stats";
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
  /** Real Monthly Recurring Revenue from active subscriptions (yearly plans divided by 12) — the same formula src/lib/payments-stats.ts uses for the Revenue section's own MRR figure, so this never disagrees with what's already on screen elsewhere in the dashboard. Distinct from paymongoRevenue, which is lifetime payment total, not "recurring." */
  mrr: number;
  /** Real business name of Axla's own DTI registration, if one is on file — never fabricated. */
  axlaDtiName: string | null;
  /** Real count from the transactions table (GCash + Maya + bank uploads combined). */
  totalTransactions: number;
  /** Count of genuinely wired-up upload parsers: GCash, Maya, generic bank (CSV+XLSX) — a fixed capability count, not a query. */
  parsersActive: number;
  /** Count of genuinely wired-up export formats: QuickBooks, Xero, Sheets CSV — a fixed capability count, not a query. */
  exportsAvailable: number;
  /** Real counts from page_views (public landing page only — /admin, /dashboard, /api are never tracked). */
  visitorsToday: number;
  visitorsYesterday: number;
  liveVisitorsNow: number;
  /** Real top UTM source by page-view count in the last 30 days, or null if none tracked (never fabricated). */
  topUtmSource: string | null;
  /** paidLast30Days / visitorsLast30Days * 100, rounded to 1 decimal — 0 when there's no visitor data yet, never divide-by-zero. */
  conversionRatePct: number;
  paidLast30Days: number;
  /** True only when the page_views query failed with Postgres 42P01 (undefined_table) — lets Jarvis say the table isn't set up yet instead of silently reporting 0 visitors. */
  pageViewsTableMissing: boolean;
  /** Axla Payroll — same payments/subscriptions rows as paymongoRevenue/mrr above, filtered to product="axla_payroll" / plan starting "payroll_" so this never disagrees with the admin dashboard's Payroll tab. */
  payrollTotalSignups: number;
  payrollMrr: number;
  payrollRevenue: number;
  payrollActiveUsers: number;
  payrollFailedPayments: number;
}

interface SourceBreakdown {
  value: string;
  count: number;
}

interface RecentSignup {
  email: string;
  createdAt: string;
}

interface PaidSubscriber {
  email: string;
  amount: number;
  createdAt: string;
}

// Each egg contributes at most one "Sir" — some contribute none — so
// appending one to a response that already used "Sir" once never exceeds
// the 2-per-response ceiling.
const JARVIS_EASTER_EGGS = [
  "As you wish, Sir.",
  "I've taken the liberty of checking.",
  "Systems at 100 percent. Unlike your sleep schedule — just kidding.",
  "At your service.",
  "Anything else, Sir?",
];

const FRIDAY_EASTER_EGGS = ["Got it, Sir!", "On it!", "You got it!"];

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

/** "Jul 26" in Asia/Manila local time — subscriptions.created_at is stored UTC, and a plain toLocaleDateString would use the server's own timezone instead. */
function formatManilaShortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", month: "short", day: "numeric" }).format(new Date(iso));
}

/** "renzsom2022@gmail.com P499, freedomhunter2025@gmail.com P249" — real per-customer breakdown, never fabricated. */
function buildSubscriberBreakdown(subs: PaidSubscriber[]): string {
  return subs.map((s) => `${s.email} P${s.amount.toLocaleString()}`).join(", ");
}

function buildLatestSubscriberLine(subs: PaidSubscriber[]): string {
  const latest = subs[0];
  if (!latest) return "";
  return `Latest: ${latest.email} ${formatManilaShortDate(latest.createdAt)} PRO active`;
}

/** "Expiring soon: renzsom2022@gmail.com in 5 days" — real churn-risk signal, never fabricated; empty when nothing's within the window. */
function buildExpiringSoonLine(expiringSoon: ExpiringSubscriber[]): string {
  if (expiringSoon.length === 0) return "";
  const parts = expiringSoon.map((s) => `${s.email} in ${s.daysLeft <= 0 ? "0" : s.daysLeft} day${s.daysLeft === 1 ? "" : "s"}`);
  return `Expiring soon: ${parts.join(", ")}`;
}

/** Spoken summary of the most urgent deadlines — never invents a number, just describes real computed daysLeft/status. Exactly one "Sir", at the end. */
function buildBirVoiceSummary(deadlines: BirDeadline[]): string {
  const overdue = deadlines.filter((d) => d.status === "OVERDUE");
  const urgent = deadlines.filter((d) => d.status === "WARNING");

  if (overdue.length > 0) {
    const names = overdue.map((d) => `${d.name.split(" ")[0]} (${Math.abs(d.daysLeft)} days overdue)`).join(", ");
    return `You have ${overdue.length} overdue filing${overdue.length === 1 ? "" : "s"}: ${names}. Let's get on that, Sir.`;
  }
  if (urgent.length === 0) {
    return "No overdue or urgent BIR deadlines this week. All good, Sir.";
  }
  const parts = urgent.map((d) => `${d.name.split(" ")[0]} on ${formatDeadlineDate(d.date)}, ${d.daysLeft} day${d.daysLeft === 1 ? "" : "s"} left`);
  return `Quick BIR check — you have ${urgent.length} deadline${urgent.length === 1 ? "" : "s"} this week: ${parts.join(", and ")}. No overdue. All good, Sir.`;
}

type Intent = "wake-up" | "greeting" | "intro" | "managed" | null;

/** Which of these fixed phrasings the query matches, checked before the generic data-lookup keywords (bir/invoice/dti/hate/revenue/etc). */
function detectIntent(query: string): Intent {
  if (/wake\s*up|hey jarvis|yo jarvis|are you there/.test(query)) return "wake-up";
  if (/good\s*(morning|afternoon|evening)/.test(query)) return "greeting";
  if (/introduce yourself|who are you|what are you\b|sino ka|ano ka|what do you do/.test(query)) return "intro";
  if (/what do you manage|what are you managing|anong hawak mo/.test(query)) return "managed";
  return null;
}

/** Which time-of-day word the admin actually said, if any — used to decide whether to gently correct a mismatched "good morning" said at night in Manila. */
function detectSaidGreetingWord(query: string): "morning" | "afternoon" | "evening" | null {
  const match = query.match(/good\s*(morning|afternoon|evening)/);
  return (match?.[1] as "morning" | "afternoon" | "evening" | undefined) ?? null;
}

function greetingWordMatches(greeting: string, said: "morning" | "afternoon" | "evening" | null): boolean {
  if (!said) return true;
  return greeting.toLowerCase().includes(said);
}

/**
 * The same set of managed-systems facts, phrased as short clauses reused
 * by both the full introduction and the shorter "what do you manage"
 * answer. Real stats/deadlines only — DTI callout only fires when a real
 * AXLA-named registration is actually on file, and deliberately lists
 * 2551Q (percentage tax), not 2550Q (VAT) — this app's actual users are
 * 8%/3% percentage-tax freelancers, not VAT-registered businesses.
 * Deliberately Sir-free — the wrapping answer places "Sir" exactly once,
 * these bullets are just the factual clauses around it.
 */
function managedSystemsBullets(stats: JarvisStats, deadlines: BirDeadline[]): string[] {
  const urgentCount = deadlines.filter((d) => d.status !== "OK").length;
  const dtiBullet = stats.axlaDtiName
    ? `${stats.dtiCount} DTI kit${stats.dtiCount === 1 ? "" : "s"} certified — ${stats.axlaDtiName}, passed`
    : stats.dtiCount > 0
      ? `${stats.dtiCount} DTI kit${stats.dtiCount === 1 ? "" : "s"} on file`
      : "No DTI kits registered yet";

  return [
    `${stats.totalUsers} active users and ${stats.totalWaitlist} waitlisted — average frustration ${stats.avgHateLevel} out of 10`,
    `PHP ${stats.mrr.toLocaleString()} MRR — revenue tracking`,
    `${stats.invoicesTotal} invoice${stats.invoicesTotal === 1 ? "" : "s"} — toolkit monitoring`,
    `${stats.totalTransactions} transaction${stats.totalTransactions === 1 ? "" : "s"} synced across ${stats.parsersActive} parsers (GCash, Maya, bank) — ${stats.exportsAvailable} export formats ready (QuickBooks, Xero, Sheets)`,
    dtiBullet,
    `BIR deadlines — 2551Q, 1701Q, 1601C, Annual ITR — I track the countdown so you never get penalized${urgentCount > 0 ? ` (${urgentCount} need${urgentCount === 1 ? "s" : ""} attention this week)` : ""}`,
    "DTI/SEC/Mayor's compliance — certifications and renewals",
    "System health — 100% operational",
  ];
}

/** Full identity + managed-systems list. Exactly one "Sir", right after the greeting. */
function buildIntroAnswer(stats: JarvisStats, deadlines: BirDeadline[], greeting: string, persona: Persona, forVoice: boolean): string {
  const bullets = managedSystemsBullets(stats, deadlines);
  const bulletText = forVoice ? bullets.join("; ") : bullets.map((b) => `• ${b}`).join("\n");

  if (persona === "friday") {
    const body = forVoice
      ? `I am FRIDAY — Female Replacement Intelligent Digital Assistant Youth. After Jarvis, Tony upgraded to me — so you got the upgrade too! ` +
        `I am running your Axla business. Specifically: ${bulletText}. I am your Friday — always on, always watching. What do you need?`
      : `I am FRIDAY — Female Replacement Intelligent Digital Assistant Youth. After Jarvis, Tony upgraded to me — so you got the upgrade too!\n\n` +
        `I am running your Axla business:\n${bulletText}\n\n` +
        `I am your Friday. Always on, always watching. What do you need?`;
    return `${greeting}, Sir! ${body}`;
  }

  const body = forVoice
    ? `I am Jarvis — Just A Rather Very Intelligent System. Originally Mr. Stark's A I, now yours. ` +
      `I manage your entire Axla operations: ${bulletText}. ` +
      `Think of me as your business co-pilot. I run the numbers, watch the deadlines, and keep Axla sharp while you build. At your service.`
    : `I am Jarvis — Just A Rather Very Intelligent System. Originally Mr. Stark's AI, now yours.\n\n` +
      `I manage your entire Axla operations:\n${bulletText}\n\n` +
      `Think of me as your business co-pilot. I run the numbers, watch the deadlines, and keep Axla sharp while you build. At your service.`;
  return `${greeting}, Sir. ${body}`;
}

/** Condensed "what do you manage" answer. Exactly one "Sir", right after the greeting. */
function buildManagedAnswer(stats: JarvisStats, deadlines: BirDeadline[], greeting: string, persona: Persona): string {
  const urgentCount = deadlines.filter((d) => d.status !== "OK").length;
  const summary =
    `Users ${stats.totalUsers}, Waitlist ${stats.totalWaitlist}, Revenue PHP ${stats.mrr.toLocaleString()} MRR, ` +
    `Invoices ${stats.invoicesTotal}, DTI ${stats.dtiCount}${stats.axlaDtiName ? " passed" : ""}, ` +
    `BIR deadlines with countdown${urgentCount > 0 ? ` (${urgentCount} urgent)` : ""}, system health 100%`;
  return persona === "friday"
    ? `${greeting}, Sir! I manage your entire Axla operations — ${summary}. Basically, I run Axla while you build!`
    : `${greeting}, Sir. I manage your entire Axla operations — ${summary}. Basically, I run Axla while you build.`;
}

/** Short online-check response. Exactly one "Sir", right after the greeting. */
function buildWakeUpAnswer(stats: JarvisStats, deadlines: BirDeadline[], greeting: string, persona: Persona): string {
  const urgentCount = deadlines.filter((d) => d.status !== "OK").length;
  const managing =
    `${stats.totalUsers} users, ${stats.totalWaitlist} waitlist, PHP ${stats.mrr.toLocaleString()} MRR, ` +
    `BIR deadlines${urgentCount > 0 ? ` (${urgentCount} urgent)` : ""}, DTI kits`;
  return persona === "friday"
    ? `${greeting}, Sir! FRIDAY online. Managing ${managing} — all operational.`
    : `${greeting}, Sir. Jarvis online. Managing ${managing} — all operational.`;
}

/** "Good morning/afternoon/evening Jarvis" response. Exactly one "Sir", right after the greeting; mismatch note (if any) stays Sir-free. */
function buildGreetingAnswer(
  stats: JarvisStats,
  deadlines: BirDeadline[],
  manila: ManilaGreeting,
  saidWord: "morning" | "afternoon" | "evening" | null,
  persona: Persona,
): string {
  const mismatch = !greetingWordMatches(manila.greeting, saidWord)
    ? ` You said good ${saidWord}, but it's actually ${manila.greeting.toLowerCase().replace("good ", "")} here in Manila — no worries, I've got you.`
    : "";
  const dtiBit = stats.axlaDtiName ? `1 DTI passed` : `${stats.dtiCount} DTI on file`;
  const summary = `${stats.totalUsers} users, ${stats.totalWaitlist} waitlist at ${stats.avgHateLevel} hate, ${stats.mrr.toLocaleString()} MRR, ${dtiBit}, BIR deadlines tracked`;

  return persona === "friday"
    ? `${manila.greeting}, Sir! ${manila.vibe} FRIDAY here, online and managing your Axla empire — ${summary}.${mismatch} All green!`
    : `${manila.greeting}, Sir! ${manila.vibe} Jarvis here, online and managing your Axla empire — ${summary}.${mismatch} All green!`;
}

/**
 * Simple keyword router today, no OpenAI call — but the shape (gather real
 * `stats` first, then build `answer`/`voiceAnswer` from them) is
 * deliberately kept so a later upgrade can swap the template-string step
 * for an LLM call fed the same `stats` object, without touching the
 * data-gathering half.
 */
async function gatherStats(): Promise<{
  stats: JarvisStats;
  latestUsers: RecentSignup[];
  latestWaitlist: RecentSignup[];
  recentSubscribers: PaidSubscriber[];
  expiringSoon: ExpiringSubscriber[];
  topReferrers: SourceBreakdown[];
  topUtmSources: SourceBreakdown[];
}> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
  const thirtyDaysAgo = new Date(todayStart.getTime() - 30 * 86_400_000);
  const liveThreshold = new Date(now.getTime() - 5 * 60 * 1000);

  const [
    { count: totalUsers },
    { data: waitlist },
    { data: chatMessages },
    { data: invoices },
    { data: registrations },
    { data: payments },
    { data: subscriptions },
    { data: recentProfiles },
    { data: recentWaitlist },
    { count: totalTransactions },
    { data: pageViewsLast30Days, error: pageViewsError },
  ] = await Promise.all([
    supabaseAdmin.from("profiles").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("waitlist").select("bir_hate_level, created_at"),
    supabaseAdmin.from("chat_messages").select("created_at, message"),
    supabaseAdmin.from("invoices").select("total, status, created_at"),
    supabaseAdmin.from("business_registrations").select("type, data"),
    supabaseAdmin.from("payments").select("id, email, amount, currency, status, provider, payment_method, plan, product, created_at"),
    supabaseAdmin
      .from("subscriptions")
      .select("email, plan, status, amount, provider, billing_cycle, current_period_start, current_period_end, created_at"),
    supabaseAdmin.from("profiles").select("email, created_at").order("created_at", { ascending: false }).limit(3),
    supabaseAdmin.from("waitlist").select("email, created_at").order("created_at", { ascending: false }).limit(3),
    supabaseAdmin.from("transactions").select("id", { count: "exact", head: true }),
    supabaseAdmin.from("page_views").select("referrer, utm_source, created_at").gte("created_at", thirtyDaysAgo.toISOString()),
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

  // Reconciled against subscriptions the same way src/lib/payments-stats.ts's
  // admin Revenue section is — a subscription with no matching "paid"
  // payment row (e.g. one inserted directly rather than via the webhook)
  // still counts, so this never silently under-reports versus what's
  // already shown on screen elsewhere in the dashboard.
  const reconciledPayments = reconcilePayments(payments ?? [], subscriptions ?? []);
  const paymongoRevenue = reconciledPayments.filter((p) => p.status === "paid").reduce((sum, p) => sum + Number(p.amount), 0);

  // Same formula as src/lib/payments-stats.ts's own MRR figure (active
  // subscriptions, yearly plans divided by 12) — kept identical on purpose
  // so this never quietly disagrees with the number already shown in the
  // dashboard's Revenue section.
  const mrr = Math.round(
    (subscriptions ?? [])
      .filter((s) => s.status === "active")
      .reduce((sum, s) => sum + (s.billing_cycle === "yearly" ? Number(s.amount) / 12 : Number(s.amount)), 0),
  );

  // Axla Payroll — a payroll subscription's plan value is always one of
  // payroll_starter/payroll_business/payroll_enterprise (never "pro"/
  // "business"), so this filter can never accidentally include a real
  // TaxLaya subscriber. See migration 018 for why payroll shares this table
  // rather than getting its own.
  const payrollSubs = (subscriptions ?? []).filter((s) => s.plan?.startsWith("payroll_"));
  const payrollActiveSubs = payrollSubs.filter((s) => s.status === "active");
  const payrollMrr = Math.round(payrollActiveSubs.reduce((sum, s) => sum + Number(s.amount), 0));
  const payrollPayments = (payments ?? []).filter((p) => p.product === "axla_payroll");
  const payrollRevenue = payrollPayments.filter((p) => p.status === "paid").reduce((sum, p) => sum + Number(p.amount), 0);
  const payrollFailedPayments = payrollPayments.filter((p) => p.status === "failed").length;

  const recentSubscribers: PaidSubscriber[] = (subscriptions ?? [])
    .filter((s) => s.status === "active")
    .map((s) => ({ email: s.email, amount: Number(s.amount), createdAt: s.created_at }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const expiringSoon = findExpiringSoon(subscriptions ?? []);

  // Visitor stats — page_views only ever holds public landing-page rows
  // (src/app/api/analytics/track/route.ts excludes /admin, /dashboard,
  // /api at the write path itself), so no further filtering needed here.
  // 42P01 = Postgres "undefined_table" — surfaced distinctly so Jarvis can
  // say the table hasn't been created yet instead of silently reporting 0
  // visitors forever, which would look like a real (but wrong) answer.
  const pageViewsTableMissing = pageViewsError?.code === "42P01";
  const viewRows = pageViewsLast30Days ?? [];
  const visitorsToday = viewRows.filter((v) => new Date(v.created_at) >= todayStart).length;
  const visitorsYesterday = viewRows.filter((v) => {
    const t = new Date(v.created_at);
    return t >= yesterdayStart && t < todayStart;
  }).length;
  const liveVisitorsNow = viewRows.filter((v) => new Date(v.created_at) >= liveThreshold).length;

  function topCounts(values: (string | null)[], limit: number): SourceBreakdown[] {
    const counts = new Map<string, number>();
    for (const v of values) {
      if (!v) continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([value, count]) => ({ value, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  const topReferrers = topCounts(viewRows.map((v) => v.referrer), 5);
  const topUtmSources = topCounts(viewRows.map((v) => v.utm_source), 5);
  const topUtmSource = topUtmSources[0]?.value ?? null;

  const paidLast30Days = (subscriptions ?? []).filter((s) => new Date(s.created_at) >= thirtyDaysAgo).length;
  const conversionRatePct = viewRows.length > 0 ? Math.round((paidLast30Days / viewRows.length) * 1000) / 10 : 0;

  return {
    stats: {
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
      mrr,
      axlaDtiName,
      totalTransactions: totalTransactions ?? 0,
      parsersActive: 3,
      exportsAvailable: 3,
      visitorsToday,
      visitorsYesterday,
      liveVisitorsNow,
      topUtmSource,
      conversionRatePct,
      paidLast30Days,
      pageViewsTableMissing,
      payrollTotalSignups: payrollSubs.length,
      payrollMrr,
      payrollRevenue,
      payrollActiveUsers: payrollActiveSubs.length,
      payrollFailedPayments,
    },
    latestUsers: (recentProfiles ?? []).map((p) => ({ email: p.email, createdAt: p.created_at })),
    latestWaitlist: (recentWaitlist ?? []).map((w) => ({ email: w.email, createdAt: w.created_at })),
    recentSubscribers,
    expiringSoon,
    topReferrers,
    topUtmSources,
  };
}

/** Text-display answer (with emojis) — addresses the admin as "Sir" once per branch, never repeated. */
function buildAnswer(
  q: string,
  stats: JarvisStats,
  deadlines: BirDeadline[],
  manila: ManilaGreeting,
  persona: Persona,
  recentSubscribers: PaidSubscriber[],
  expiringSoon: ExpiringSubscriber[],
  topReferrers: SourceBreakdown[],
  topUtmSources: SourceBreakdown[],
): string {
  const query = q.toLowerCase();
  const intent = detectIntent(query);

  if (intent === "wake-up") return buildWakeUpAnswer(stats, deadlines, manila.greeting, persona);
  if (intent === "greeting") return buildGreetingAnswer(stats, deadlines, manila, detectSaidGreetingWord(query), persona);
  if (intent === "intro") return buildIntroAnswer(stats, deadlines, manila.greeting, persona, false);
  if (intent === "managed") return buildManagedAnswer(stats, deadlines, manila.greeting, persona);

  if (query.includes("bir") || query.includes("deadline")) {
    const lines = deadlines
      .map((d) => `${d.status === "OVERDUE" ? "🔴" : d.status === "WARNING" ? "⚠️" : "🟢"} ${d.name}: ${formatDeadlineDate(d.date)} (${d.daysLeft}d)`)
      .join(" | ");
    return `📅 BIR deadlines, Sir: ${lines}`;
  }

  if (query.includes("invoice")) {
    return (
      `📄 Invoices, Sir: ${stats.invoicesTotal} total (${stats.invoicesToday} today). ` +
      `Paid: PHP ${stats.invoicesPaidTotal.toLocaleString()}. Outstanding: PHP ${stats.invoicesOutstanding.toLocaleString()}.`
    );
  }

  if (query.includes("dti") || query.includes("sec") || query.includes("mayor")) {
    return `🏢 Business Toolkit registrations, Sir: DTI ${stats.dtiCount}, SEC ${stats.secCount}, Mayor's Permit ${stats.mayorsCount}.`;
  }

  if (query.includes("transaction") || query.includes("parser") || query.includes("export")) {
    return `🔄 ${stats.totalTransactions} transactions synced across ${stats.parsersActive} live parsers (GCash, Maya, bank), Sir. ${stats.exportsAvailable} export formats ready — QuickBooks, Xero, Sheets.`;
  }

  if (query.includes("hate")) {
    return `🔥 Average BIR hate level: ${stats.avgHateLevel}/10 across ${stats.totalWaitlist} signups, Sir.`;
  }

  if (query.includes("churn") || query.includes("expiring")) {
    const expiringLine = buildExpiringSoonLine(expiringSoon);
    return expiringLine
      ? `⏰ Sir, ${expiringLine}.`
      : `✅ No subscriptions expiring within 7 days, Sir.`;
  }

  if (query.includes("where from") || query.includes("saan galing")) {
    const referrersLine = topReferrers.length
      ? topReferrers.map((r) => `${r.value} (${r.count})`).join(", ")
      : "no referrer data yet";
    const sourcesLine = topUtmSources.length
      ? topUtmSources.map((s) => `${s.value} (${s.count})`).join(", ")
      : "no UTM source data yet";
    return `🌐 Sir, top referrers (last 30d): ${referrersLine}. Top UTM sources: ${sourcesLine}.`;
  }

  if (query.includes("visitor") || query.includes("traffic") || query.includes("ilan visitors")) {
    if (stats.pageViewsTableMissing) {
      return "⚠️ Sir, page_views table not yet created - run SQL in Supabase.";
    }
    return (
      `📈 Sir, we have ${stats.visitorsToday} visitors today, ${stats.liveVisitorsNow} live now, ` +
      `top source ${stats.topUtmSource ?? "n/a"}, conversion ${stats.conversionRatePct}% — ${stats.paidLast30Days} paid in last 30d.`
    );
  }

  // Checked before the generic revenue/report branches below — "payroll
  // revenue"/"payroll report" both contain those words too and would
  // otherwise match the combined-product answer instead of this one.
  if (query.includes("payroll")) {
    return (
      `📋 Axla Payroll, Sir — ${stats.payrollTotalSignups} total signup${stats.payrollTotalSignups === 1 ? "" : "s"}, ` +
      `${stats.payrollActiveUsers} active. MRR PHP ${stats.payrollMrr.toLocaleString()}, ` +
      `Total Revenue PHP ${stats.payrollRevenue.toLocaleString()}.` +
      `${stats.payrollFailedPayments > 0 ? ` ${stats.payrollFailedPayments} failed payment${stats.payrollFailedPayments === 1 ? "" : "s"}.` : ""}`
    );
  }

  if (
    query.includes("revenue") ||
    query.includes("mrr") ||
    query.includes("paymongo") ||
    query.includes("subscription") ||
    query.includes("recent payment") ||
    query.includes("how many paid")
  ) {
    const breakdown = buildSubscriberBreakdown(recentSubscribers);
    const latestLine = buildLatestSubscriberLine(recentSubscribers);
    const expiringLine = buildExpiringSoonLine(expiringSoon);
    return (
      `💰 Sir, we have ${recentSubscribers.length} active paid user${recentSubscribers.length === 1 ? "" : "s"}, ` +
      `Total Revenue PHP ${stats.paymongoRevenue.toLocaleString()}${breakdown ? ` (${breakdown})` : ""}. ` +
      `Invoices paid: PHP ${stats.invoicesPaidTotal.toLocaleString()}.${latestLine ? ` ${latestLine}.` : ""}${expiringLine ? ` ${expiringLine}.` : ""}`
    );
  }

  if (query.includes("today") || query.includes("report")) {
    const breakdown = buildSubscriberBreakdown(recentSubscribers);
    const latestLine = buildLatestSubscriberLine(recentSubscribers);
    const expiringLine = buildExpiringSoonLine(expiringSoon);
    return (
      `📊 Sir, we have ${recentSubscribers.length} active paid user${recentSubscribers.length === 1 ? "" : "s"}, ` +
      `Total Revenue PHP ${stats.paymongoRevenue.toLocaleString()}${breakdown ? ` (${breakdown})` : ""}.${latestLine ? ` ${latestLine}.` : ""} ` +
      `Today — Signups: ${stats.signupsToday}, Messages: ${stats.messagesToday}, Invoices: ${stats.invoicesToday}, ` +
      `Visitors: ${stats.visitorsToday} (${stats.liveVisitorsNow} live). ` +
      `Totals — Users: ${stats.totalUsers}, Waitlist: ${stats.totalWaitlist}, Avg hate: ${stats.avgHateLevel}/10, DTI kits: ${stats.dtiCount}.${expiringLine ? ` ${expiringLine}.` : ""}`
    );
  }

  return (
    `👋 Users: ${stats.totalUsers}, Waitlist: ${stats.totalWaitlist} (avg hate ${stats.avgHateLevel}/10), ` +
    `Invoices: ${stats.invoicesTotal}, DTI/SEC/Mayor's kits: ${stats.dtiCount + stats.secCount + stats.mayorsCount}, Sir. ` +
    `Try "report today", "invoice report", or "how many DTI?"`
  );
}

/**
 * Same numbers as buildAnswer(), reworded for speech, split by persona:
 * Jarvis (formal butler) vs FRIDAY (upbeat, casual) — both call the admin
 * "Sir" at most once (twice for the longer report, plus a possible
 * easter-egg addition), never once per sentence. No emojis (TTS engines
 * mangle them), full words instead of symbols ("pesos" not "PHP", "out of
 * 10" not "/10"). The AXLA DTI line only appears if a real DTI kit with
 * "AXLA" in the business name is actually on file (axlaDtiName) — never
 * asserted when there isn't one, and always says whatever name is really
 * stored rather than a hardcoded string.
 */
function buildVoiceAnswer(
  q: string,
  stats: JarvisStats,
  persona: Persona,
  deadlines: BirDeadline[],
  manila: ManilaGreeting,
  recentSubscribers: PaidSubscriber[],
  expiringSoon: ExpiringSubscriber[],
  topReferrers: SourceBreakdown[],
  topUtmSources: SourceBreakdown[],
): string {
  const query = q.toLowerCase();
  const egg = maybeEasterEgg(persona);
  const isFriday = persona === "friday";
  const greeting = manila.greeting;
  const intent = detectIntent(query);

  if (intent === "wake-up") return buildWakeUpAnswer(stats, deadlines, greeting, persona);
  if (intent === "greeting") return buildGreetingAnswer(stats, deadlines, manila, detectSaidGreetingWord(query), persona);
  if (intent === "intro") return buildIntroAnswer(stats, deadlines, greeting, persona, true);
  if (intent === "managed") return buildManagedAnswer(stats, deadlines, greeting, persona);

  if (query.includes("bir") || query.includes("deadline")) {
    return `${buildBirVoiceSummary(deadlines)}${egg}`;
  }

  if (query.includes("invoice")) {
    return isFriday
      ? `You've got ${stats.invoicesTotal} invoices total, ${stats.invoicesToday} today, Sir. Paid: ${stats.invoicesPaidTotal.toLocaleString()} pesos. Outstanding: ${stats.invoicesOutstanding.toLocaleString()} pesos.${egg}`
      : `You have ${stats.invoicesTotal} invoices total, ${stats.invoicesToday} today, Sir. Paid: ${stats.invoicesPaidTotal.toLocaleString()} pesos. Outstanding: ${stats.invoicesOutstanding.toLocaleString()} pesos.${egg}`;
  }

  if (query.includes("dti") || query.includes("sec") || query.includes("mayor")) {
    const axlaLine = stats.axlaDtiName ? ` ${stats.axlaDtiName}, certified.` : "";
    return isFriday
      ? `Business Toolkit check: ${stats.dtiCount} D T I, ${stats.secCount} SEC, ${stats.mayorsCount} Mayor's Permit, Sir.${axlaLine}${egg}`
      : `Business Toolkit registrations: ${stats.dtiCount} D T I, ${stats.secCount} SEC, ${stats.mayorsCount} Mayor's Permit, Sir.${axlaLine}${egg}`;
  }

  if (query.includes("hate")) {
    return `The average frustration level is ${stats.avgHateLevel} out of 10, across ${stats.totalWaitlist} signups, Sir.${egg}`;
  }

  if (query.includes("churn") || query.includes("expiring")) {
    const expiringLine = buildExpiringSoonLine(expiringSoon);
    return expiringLine ? `Sir, ${expiringLine}.${egg}` : `No subscriptions expiring within 7 days, Sir.${egg}`;
  }

  if (query.includes("where from") || query.includes("saan galing")) {
    const referrersLine = topReferrers.length
      ? topReferrers.map((r) => `${r.value}, ${r.count}`).join("; ")
      : "no referrer data yet";
    const sourcesLine = topUtmSources.length
      ? topUtmSources.map((s) => `${s.value}, ${s.count}`).join("; ")
      : "no UTM source data yet";
    return `Sir, top referrers in the last 30 days: ${referrersLine}. Top UTM sources: ${sourcesLine}.${egg}`;
  }

  if (query.includes("visitor") || query.includes("traffic") || query.includes("ilan visitors")) {
    if (stats.pageViewsTableMissing) {
      return `Sir, the page views table isn't set up yet — please run the SQL in Supabase.${egg}`;
    }
    return (
      `Sir, we have ${stats.visitorsToday} visitors today, ${stats.liveVisitorsNow} live now, ` +
      `top source ${stats.topUtmSource ?? "not available"}, conversion ${stats.conversionRatePct} percent — ` +
      `${stats.paidLast30Days} paid in the last 30 days.${egg}`
    );
  }

  if (query.includes("payroll")) {
    return (
      `Axla Payroll, Sir — ${stats.payrollTotalSignups} total signup${stats.payrollTotalSignups === 1 ? "" : "s"}, ` +
      `${stats.payrollActiveUsers} active. M R R ${stats.payrollMrr.toLocaleString()} pesos, ` +
      `Total Revenue ${stats.payrollRevenue.toLocaleString()} pesos.` +
      `${stats.payrollFailedPayments > 0 ? ` ${stats.payrollFailedPayments} failed payment${stats.payrollFailedPayments === 1 ? "" : "s"}.` : ""}${egg}`
    );
  }

  if (
    query.includes("revenue") ||
    query.includes("mrr") ||
    query.includes("paymongo") ||
    query.includes("subscription") ||
    query.includes("recent payment") ||
    query.includes("how many paid")
  ) {
    const breakdown = buildSubscriberBreakdown(recentSubscribers);
    const expiringLine = buildExpiringSoonLine(expiringSoon);
    return (
      `Sir, we have ${recentSubscribers.length} active paid user${recentSubscribers.length === 1 ? "" : "s"}, ` +
      `Total Revenue ${stats.paymongoRevenue.toLocaleString()} pesos${breakdown ? ` — ${breakdown}` : ""}. ` +
      `Invoices paid: ${stats.invoicesPaidTotal.toLocaleString()} pesos.${expiringLine ? ` ${expiringLine}.` : ""}${egg}`
    );
  }

  const dtiLine = stats.axlaDtiName
    ? `One DTI kit registered — ${stats.axlaDtiName}, certified. `
    : stats.dtiCount > 0
      ? `${stats.dtiCount} D T I kit${stats.dtiCount === 1 ? "" : "s"} on file. `
      : "";

  if (query.includes("today") || query.includes("report")) {
    // Matches the requested example closely: greeting alone (no "Sir"),
    // one "Sir" placed mid-list, the single soonest urgent deadline named
    // (not just a count), ending plain.
    const dtiPassedBit = stats.axlaDtiName ? "1 DTI passed" : stats.dtiCount > 0 ? `${stats.dtiCount} DTI on file` : "no DTI kits yet";
    const urgent = deadlines.filter((d) => d.status !== "OK").sort((a, b) => a.daysLeft - b.daysLeft);
    const next = urgent[0];
    const deadlineMention = next
      ? next.status === "OVERDUE"
        ? ` ${next.name.split(" ")[0]} is ${Math.abs(next.daysLeft)} days overdue.`
        : ` BIR next deadline in ${next.daysLeft} day${next.daysLeft === 1 ? "" : "s"}.`
      : "";
    const latestLine = buildLatestSubscriberLine(recentSubscribers);
    const latestMention = latestLine ? ` ${latestLine}.` : "";
    const expiringLine = buildExpiringSoonLine(expiringSoon);
    const expiringMention = expiringLine ? ` ${expiringLine}.` : "";
    const visitorsMention = ` ${stats.visitorsToday} visitors today, ${stats.liveVisitorsNow} live now.`;

    return isFriday
      ? `${greeting}! We have ${stats.totalUsers} users, ${stats.totalWaitlist} waitlist averaging ${stats.avgHateLevel} hate, ` +
          `${recentSubscribers.length} active paid user${recentSubscribers.length === 1 ? "" : "s"}, Total Revenue ${stats.paymongoRevenue.toLocaleString()} pesos, ` +
          `${stats.invoicesTotal} invoices, ${dtiPassedBit}, Sir.${deadlineMention}${latestMention}${expiringMention}${visitorsMention} All systems operational!${egg}`
      : `${greeting}. We have ${stats.totalUsers} users, ${stats.totalWaitlist} waitlist averaging ${stats.avgHateLevel} hate, ` +
          `${recentSubscribers.length} active paid user${recentSubscribers.length === 1 ? "" : "s"}, Total Revenue ${stats.paymongoRevenue.toLocaleString()} pesos, ` +
          `${stats.invoicesTotal} invoices, ${dtiPassedBit}, Sir.${deadlineMention}${latestMention}${expiringMention}${visitorsMention} All systems operational.${egg}`;
  }

  const kitTotal = stats.dtiCount + stats.secCount + stats.mayorsCount;
  const urgentDeadlines = deadlines.filter((d) => d.status !== "OK");
  const deadlineMention =
    urgentDeadlines.length > 0
      ? ` Heads up: ${urgentDeadlines.length} BIR deadline${urgentDeadlines.length === 1 ? "" : "s"} need${urgentDeadlines.length === 1 ? "s" : ""} attention this week.`
      : "";

  return isFriday
    ? `${greeting}! We have ${stats.totalUsers} users and ${stats.totalWaitlist} waitlist, average hate ${stats.avgHateLevel}, Sir. ` +
        `${dtiLine}${stats.invoicesTotal} invoices, ${kitTotal} toolkit kit${kitTotal === 1 ? "" : "s"} total.${deadlineMention} ` +
        `Ask me for a report today, an invoice report, or how many D T I.${egg}`
    : `${greeting}. We currently have ${stats.totalUsers} users and ${stats.totalWaitlist} on the waitlist, average frustration ` +
        `level ${stats.avgHateLevel} out of 10, Sir. ${dtiLine}${stats.invoicesTotal} invoices, ${kitTotal} business toolkit kit${kitTotal === 1 ? "" : "s"} in total.${deadlineMention} ` +
        `You may ask for a report today, an invoice report, or how many D T I.${egg}`;
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
    const { stats, latestUsers, latestWaitlist, recentSubscribers, expiringSoon, topReferrers, topUtmSources } = await gatherStats();
    const deadlines = getBirDeadlines(now);
    const manila = getManilaGreeting(now);
    const answer = buildAnswer(q, stats, deadlines, manila, persona, recentSubscribers, expiringSoon, topReferrers, topUtmSources);
    const voiceAnswer = buildVoiceAnswer(q, stats, persona, deadlines, manila, recentSubscribers, expiringSoon, topReferrers, topUtmSources);
    return NextResponse.json({
      answer,
      voiceAnswer,
      stats,
      latestUsers,
      latestWaitlist,
      recentSubscribers,
      expiringSoon,
      topReferrers,
      topUtmSources,
      birDeadlines: deadlines,
      greeting: manila.greeting,
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
