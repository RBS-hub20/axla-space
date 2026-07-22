import { NextResponse } from "next/server";
import { generateText } from "ai";
import { openai } from "@ai-sdk/openai";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getOrCreateProfile } from "@/lib/dashboard/profile";
import { getCurrentQuarter, getQuarterLabel } from "@/lib/dashboard/quarter";
import { checkAndIncrementUsage, getUsageSummary } from "@/lib/usage";
import { buildBrainAiPrompt } from "@/lib/brain-ai-prompt";
import { logError } from "@/lib/log-error";

const HISTORY_LIMIT = 100;
const CONTEXT_MESSAGES = 10;
const RECENT_TRANSACTIONS_FOR_PROMPT = 8;

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

  const systemPrompt = buildBrainAiPrompt({
    fullName: profile?.full_name,
    taxType: profile?.tax_type,
    rdoCode: profile?.rdo_code,
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
