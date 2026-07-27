import { NextResponse } from "next/server";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getOrCreateProfile } from "@/lib/dashboard/profile";
import { getCurrentQuarter, getQuarterLabel } from "@/lib/dashboard/quarter";
import { checkAndIncrementUsage, getUsageSummary, getUserPlan } from "@/lib/usage";
import {
  buildBrainAiPrompt,
  isSummaryCommand,
  buildKitSummaryReply,
  type RegistrationSummary,
  type FilingSummary,
} from "@/lib/brain-ai-prompt";
import { logError } from "@/lib/log-error";

const HISTORY_LIMIT = 100;
const CONTEXT_MESSAGES = 10;
const RECENT_TRANSACTIONS_FOR_PROMPT = 8;
const REGISTRATIONS_FETCH_LIMIT = 50;
const RECENT_FILINGS_LIMIT = 3;

const REGISTRATION_TYPES: RegistrationSummary["type"][] = ["OPEN", "CLOSE", "SPA", "DTI", "SEC", "MAYORS"];

/** Most recent row per kit type, from a full (already created_at-desc-ordered) list. */
function latestPerType(all: RegistrationSummary[]): RegistrationSummary[] {
  const seen = new Set<string>();
  const latest: RegistrationSummary[] = [];
  for (const reg of all) {
    if (seen.has(reg.type)) continue;
    seen.add(reg.type);
    latest.push(reg);
  }
  return REGISTRATION_TYPES.filter((t) => seen.has(t)).map((t) => latest.find((r) => r.type === t)!);
}

function quarterDateRange(quarter: number, year: number): { start: string; end: string } {
  const startMonth = (quarter - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 0));
  return { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin
    .from("taxlaya_chats")
    .select("id, role, content, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true })
    .limit(HISTORY_LIMIT);

  if (error) {
    logError("dashboard/brain GET: query failed", error);
    return NextResponse.json({ error: "Failed to load chat history." }, { status: 500 });
  }

  const usage = await getUsageSummary(user.id, user.email);
  return NextResponse.json({ messages: data ?? [], aiChats: usage.aiChats, isUnlimited: usage.isUnlimited });
}

interface ChatBody {
  message?: unknown;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  let body: ChatBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "Message can't be empty." }, { status: 400 });
  }

  const usage = await checkAndIncrementUsage(user.id, user.email, "ai_chat");
  if (!usage.allowed) {
    return NextResponse.json(
      {
        code: "LIMIT_REACHED",
        type: "ai_chat",
        message: "Naubos mo na 5 free AI questions mo today. Pro = unlimited Brain AI 24/7!",
        upgrade_url: "/dashboard/settings",
      },
      { status: 403 },
    );
  }

  const profile = await getOrCreateProfile(user.id, user.email, user.name ?? user.email.split("@")[0]);

  // Real transaction context — this is what makes Brain AI different from
  // the generic public widget: it can actually see this user's numbers.
  const { quarter, year } = getCurrentQuarter();
  const { start, end } = quarterDateRange(quarter, year);
  const { data: quarterTransactions, error: txError } = await supabaseAdmin
    .from("transactions")
    .select("transaction_date, description, amount, type")
    .eq("user_id", user.id)
    .gte("transaction_date", start)
    .lte("transaction_date", end)
    .order("transaction_date", { ascending: false });
  if (txError) logError("dashboard/brain POST: transactions query failed (non-fatal)", txError);

  const transactions = quarterTransactions ?? [];
  const currentQuarterIncome = transactions.filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const currentQuarterExpenses = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);

  // Business Toolkit history, recent filings, receipts, and plan — the
  // context that makes Brain AI aware of what the user has actually done
  // across the whole app, not just their GCash transactions.
  const [registrationsRes, filingsRes, receiptsRes, plan] = await Promise.all([
    supabaseAdmin
      .from("business_registrations")
      .select("type, data, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(REGISTRATIONS_FETCH_LIMIT),
    supabaseAdmin
      .from("bir_filings")
      .select("quarter, year, gross, tax_due, status, finalized_at")
      .eq("user_id", user.id)
      .order("year", { ascending: false })
      .order("quarter", { ascending: false })
      .limit(RECENT_FILINGS_LIMIT),
    supabaseAdmin.from("receipts").select("amount").eq("user_id", user.id),
    getUserPlan(user.email),
  ]);
  if (registrationsRes.error) logError("dashboard/brain POST: business_registrations query failed (non-fatal)", registrationsRes.error);
  if (filingsRes.error) logError("dashboard/brain POST: bir_filings query failed (non-fatal)", filingsRes.error);
  if (receiptsRes.error) logError("dashboard/brain POST: receipts query failed (non-fatal)", receiptsRes.error);

  const allRegistrations: RegistrationSummary[] = (registrationsRes.data ?? []).map((r) => ({
    type: r.type as RegistrationSummary["type"],
    createdAt: r.created_at,
    data: (r.data as Record<string, unknown>) ?? {},
  }));
  const recentFilings: FilingSummary[] = (filingsRes.data ?? []).map((f) => ({
    quarter: f.quarter,
    year: f.year,
    gross: Number(f.gross),
    taxDue: Number(f.tax_due),
    status: f.status,
    finalizedAt: f.finalized_at,
  }));
  const receiptsCount = receiptsRes.data?.length ?? 0;
  const receiptsTotal = (receiptsRes.data ?? []).reduce((s, r) => s + Number(r.amount ?? 0), 0);

  // Fixed "give me a status report" phrasings skip the LLM entirely — a
  // deterministic report over real rows has nothing for a model to add
  // except a chance of getting a date or number wrong.
  if (isSummaryCommand(message)) {
    const summaryReply = buildKitSummaryReply(allRegistrations, recentFilings, receiptsCount, receiptsTotal);

    const { error: insertError } = await supabaseAdmin.from("taxlaya_chats").insert([
      { user_id: user.id, role: "user", content: message },
      { user_id: user.id, role: "assistant", content: summaryReply },
    ]);
    if (insertError) logError("dashboard/brain POST: summary history insert failed (non-fatal)", insertError);

    return NextResponse.json({ reply: summaryReply, remaining: usage.remaining, limit: usage.limit, isUnlimited: usage.isUnlimited });
  }

  const systemPrompt = buildBrainAiPrompt({
    fullName: profile?.full_name,
    taxType: profile?.tax_type,
    rdoCode: profile?.rdo_code,
    tin: profile?.tin_number,
    businessName: profile?.business_name,
    plan,
    currentQuarterLabel: getQuarterLabel(quarter, year),
    currentQuarterIncome,
    currentQuarterExpenses,
    transactionCount: transactions.length,
    recentTransactions: transactions.slice(0, RECENT_TRANSACTIONS_FOR_PROMPT).map((t) => ({
      date: t.transaction_date,
      description: t.description,
      amount: Number(t.amount),
      type: t.type as "income" | "expense",
    })),
    latestRegistrations: latestPerType(allRegistrations),
    recentFilings,
    receiptsCount,
    receiptsTotal,
  });

  const { data: recent } = await supabaseAdmin
    .from("taxlaya_chats")
    .select("role, content")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(CONTEXT_MESSAGES);

  const history = (recent ?? []).reverse().map((m) => ({
    role: m.role as "user" | "assistant",
    content: m.content as string,
  }));

  let reply: string;
  try {
    const result = await generateText({
      model: openai("gpt-4o-mini"),
      system: systemPrompt,
      messages: [...history, { role: "user" as const, content: message }],
      maxOutputTokens: 800,
    });
    reply = result.text;
  } catch (err) {
    logError("dashboard/brain POST: OpenAI call failed", err);
    return NextResponse.json({ error: "Brain AI is having trouble right now. Try again in a bit." }, { status: 502 });
  }

  const { error: insertError } = await supabaseAdmin.from("taxlaya_chats").insert([
    { user_id: user.id, role: "user", content: message },
    { user_id: user.id, role: "assistant", content: reply },
  ]);
  if (insertError) logError("dashboard/brain POST: history insert failed (non-fatal)", insertError);

  return NextResponse.json({ reply, remaining: usage.remaining, limit: usage.limit, isUnlimited: usage.isUnlimited });
}
