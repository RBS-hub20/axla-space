import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { generateQuickBooksCsv } from "@/lib/export/quickbooks";
import { generateXeroCsv } from "@/lib/export/xero";
import { generateSheetsCsv } from "@/lib/export/sheets";
import { logError } from "@/lib/log-error";

const EXPORT_TYPES = ["quickbooks", "xero", "sheets"] as const;
type ExportType = (typeof EXPORT_TYPES)[number];

/** Downloads the user's real transaction history as an accounting-software-ready CSV. GET (not POST) since this is a pure read producing a file download, same as the existing /api/dashboard/forms/[id]/pdf route. */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  if (!type || !EXPORT_TYPES.includes(type as ExportType)) {
    return NextResponse.json({ error: `type must be one of: ${EXPORT_TYPES.join(", ")}` }, { status: 400 });
  }

  const quarter = url.searchParams.get("quarter");
  const year = url.searchParams.get("year");

  let query = supabaseAdmin
    .from("transactions")
    .select("transaction_date, description, amount, type, source, quarter, year")
    .eq("user_id", user.id)
    .order("transaction_date", { ascending: true });

  if (quarter && year) {
    query = query.eq("quarter", Number(quarter)).eq("year", Number(year));
  }

  const { data, error } = await query;
  if (error) {
    logError("dashboard/export GET: query failed", error);
    return NextResponse.json({ error: "Failed to load transactions." }, { status: 500 });
  }

  const transactions = data ?? [];
  if (transactions.length === 0) {
    return NextResponse.json({ error: "No transactions to export yet — upload some first." }, { status: 400 });
  }

  let csv: string;
  let fileName: string;
  if (type === "quickbooks") {
    csv = generateQuickBooksCsv(transactions);
    fileName = "axla-quickbooks-export.csv";
  } else if (type === "xero") {
    csv = generateXeroCsv(transactions);
    fileName = "axla-xero-export.csv";
  } else {
    csv = generateSheetsCsv(transactions);
    fileName = "axla-sheets-export.csv";
  }

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${fileName}"`,
    },
  });
}
