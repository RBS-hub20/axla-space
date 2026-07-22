import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { parseGcashCsv, parseGcashPdfLines, type ParseResult } from "@/lib/dashboard/gcash-parser";
import { tryUnlockGCash, GCashPasswordRequiredError, GCashPasswordIncorrectError } from "@/lib/gcash/unlock";
import { getUserPlan, PLAN_LIMITS } from "@/lib/usage";
import { getCurrentQuarter } from "@/lib/dashboard/quarter";
import { logActivity } from "@/lib/dashboard/activity";
import { logError } from "@/lib/log-error";

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const url = new URL(req.url);
  const businessId = url.searchParams.get("businessId");

  // Quarter-sum path: never loads full transaction rows, just an aggregate
  // — the whole point of the draft/finalize workflow at scale (1000s of
  // clients shouldn't mean 1000s of full-table scans for one number).
  if (url.searchParams.get("sum") === "true") {
    const quarter = Number(url.searchParams.get("quarter"));
    const year = Number(url.searchParams.get("year"));
    const status = url.searchParams.get("status") === "finalized" ? "finalized" : "draft";

    if (![1, 2, 3, 4].includes(quarter) || !Number.isFinite(year)) {
      return NextResponse.json({ error: "quarter (1-4) and year are required." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin.rpc("sum_quarter_transactions", {
      p_user_id: user.id,
      p_year: year,
      p_quarter: quarter,
      p_status: status,
    });
    if (error) {
      logError("dashboard/transactions GET (sum): rpc failed", error);
      return NextResponse.json({ error: "Failed to sum transactions." }, { status: 500 });
    }

    const row = data?.[0] ?? { gross: 0, count: 0 };

    const { data: filing } = await supabaseAdmin
      .from("bir_filings")
      .select("id, gross, tax_due, finalized_at")
      .eq("user_id", user.id)
      .eq("year", year)
      .eq("quarter", quarter)
      .order("finalized_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return NextResponse.json({
      quarter,
      year,
      status,
      gross: Number(row.gross),
      count: Number(row.count),
      finalized: filing ?? null,
    });
  }

  let query = supabaseAdmin
    .from("transactions")
    .select("id, transaction_date, description, amount, type, business_id, created_at")
    .eq("user_id", user.id)
    .order("transaction_date", { ascending: false })
    .limit(500);
  if (businessId) query = query.eq("business_id", businessId);

  const { data, error } = await query;
  if (error) {
    logError("dashboard/transactions GET: query failed", error);
    return NextResponse.json({ error: "Failed to load transactions." }, { status: 500 });
  }

  const totalIncome = (data ?? []).filter((t) => t.type === "income").reduce((s, t) => s + Number(t.amount), 0);
  const totalExpenses = (data ?? []).filter((t) => t.type === "expense").reduce((s, t) => s + Number(t.amount), 0);

  return NextResponse.json({ transactions: data ?? [], totalIncome, totalExpenses });
}

interface UploadBody {
  csv?: unknown;
  businessId?: unknown;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  let parsed: ParseResult;
  let businessId: string | null = null;
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    const passwordRaw = form.get("password");
    const password = typeof passwordRaw === "string" && passwordRaw ? passwordRaw : undefined;
    const businessIdRaw = form.get("businessId");
    businessId = typeof businessIdRaw === "string" && businessIdRaw ? businessIdRaw : null;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided." }, { status: 400 });
    }

    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    if (isPdf) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      let lines: string[];
      try {
        lines = await tryUnlockGCash(bytes, password);
      } catch (err) {
        if (err instanceof GCashPasswordRequiredError) {
          return NextResponse.json(
            { error: "This PDF is password protected.", isProtected: true },
            { status: 422 },
          );
        }
        if (err instanceof GCashPasswordIncorrectError) {
          return NextResponse.json(
            { error: "Incorrect password. Try LASTNAME + last 4 digits of your GCash number.", isProtected: true },
            { status: 422 },
          );
        }
        logError("dashboard/transactions POST: PDF extraction failed", err);
        return NextResponse.json({ error: "Couldn't read this PDF. Try the CSV export instead." }, { status: 400 });
      }
      parsed = await parseGcashPdfLines(lines);
    } else {
      const csvText = await file.text();
      parsed = await parseGcashCsv(csvText);
    }
  } else {
    let body: UploadBody;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }
    if (typeof body.csv !== "string" || !body.csv.trim()) {
      return NextResponse.json({ error: "No CSV content provided." }, { status: 400 });
    }
    businessId = typeof body.businessId === "string" && body.businessId ? body.businessId : null;
    parsed = await parseGcashCsv(body.csv);
  }

  if (parsed.transactions.length === 0) {
    return NextResponse.json(
      { error: parsed.warning || "No valid transactions found in this file." },
      { status: 400 },
    );
  }

  const plan = await getUserPlan(user.email);
  if (plan === "free") {
    const { count, error: countError } = await supabaseAdmin
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    if (countError) logError("dashboard/transactions POST: count check failed (non-fatal)", countError);

    const existingCount = count ?? 0;
    const cap = PLAN_LIMITS.maxFreeTransactions;
    if (existingCount + parsed.transactions.length > cap) {
      return NextResponse.json(
        {
          code: "LIMIT_REACHED",
          type: "transactions",
          message: `Free plan stores up to ${cap} GCash transactions total (you have ${existingCount}, this file adds ${parsed.transactions.length}). Sa Pro, UNLIMITED!`,
          upgrade_url: "/dashboard/settings",
        },
        { status: 403 },
      );
    }
  }

  const rows = parsed.transactions.map((t) => {
    // Direct string parsing, not `new Date(t.date).getUTCMonth()` — t.date
    // is already a plain "YYYY-MM-DD" from the parser, and re-parsing
    // dates through a second Date-then-timezone hop is exactly the class
    // of bug fixed earlier in gcash-parser.ts's own parseDate(). Force UTC
    // noon so no host timezone can shift it across a day boundary.
    const { quarter, year } = getCurrentQuarter(new Date(`${t.date}T12:00:00Z`));
    return {
      user_id: user.id,
      business_id: businessId,
      transaction_date: t.date,
      description: t.description,
      amount: t.amount,
      type: t.type,
      source: "gcash_upload",
      quarter,
      year,
    };
  });

  const { error: insertError } = await supabaseAdmin.from("transactions").insert(rows);
  if (insertError) {
    logError("dashboard/transactions POST: insert failed", insertError);
    return NextResponse.json({ error: "Failed to save transactions." }, { status: 500 });
  }

  await logActivity(user.id, "gcash_uploaded", `Uploaded ${rows.length} GCash transactions`);

  return NextResponse.json({
    success: true,
    imported: rows.length,
    skippedRows: parsed.skippedRows,
    warning: parsed.warning,
  });
}
