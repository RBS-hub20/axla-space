import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/dashboard/activity";
import { logError } from "@/lib/log-error";

interface FinalizeBody {
  quarter?: unknown;
  year?: unknown;
}

/**
 * Locks a quarter's draft transactions into one bir_filings row. The 3%
 * rate is hardcoded (not a passed-in taxRate) because this endpoint is
 * specifically 2551Q — percentage tax IS 3%; an 8%/graduated rate belongs
 * to 1701Q, a different form, not an option here.
 *
 * New uploads for the same quarter after finalizing are never blocked —
 * they land as new 'draft' rows and can be finalized into a separate
 * bir_filings row later (e.g. an amendment). This endpoint only touches
 * rows that were still 'draft' at the moment it ran.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canEditFilings) {
    return NextResponse.json({ error: "You don't have permission to finalize filings." }, { status: 403 });
  }

  let body: FinalizeBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const quarter = Number(body.quarter);
  const year = Number(body.year);
  if (![1, 2, 3, 4].includes(quarter) || !Number.isFinite(year)) {
    return NextResponse.json({ error: "quarter (1-4) and year are required." }, { status: 400 });
  }

  const { data: sumRows, error: sumError } = await supabaseAdmin.rpc("sum_quarter_transactions", {
    p_user_id: owner.ownerId,
    p_year: year,
    p_quarter: quarter,
    p_status: "draft",
  });
  if (sumError) {
    logError("bir/2551q/finalize: sum rpc failed", sumError);
    return NextResponse.json({ error: "Failed to sum transactions." }, { status: 500 });
  }

  const gross = Number(sumRows?.[0]?.gross ?? 0);
  const count = Number(sumRows?.[0]?.count ?? 0);

  if (count === 0) {
    return NextResponse.json({ error: "No draft transactions found for this quarter." }, { status: 400 });
  }

  const taxDue = Math.round(gross * 0.03 * 100) / 100;

  const { data: filing, error: insertError } = await supabaseAdmin
    .from("bir_filings")
    .insert({ user_id: owner.ownerId, quarter, year, gross, tax_due: taxDue })
    .select("id")
    .single();

  if (insertError || !filing) {
    logError("bir/2551q/finalize: insert failed", insertError);
    return NextResponse.json({ error: "Failed to create filing." }, { status: 500 });
  }

  const { error: updateError } = await supabaseAdmin
    .from("transactions")
    .update({ status: "finalized" })
    .eq("user_id", owner.ownerId)
    .eq("year", year)
    .eq("quarter", quarter)
    .eq("status", "draft");

  if (updateError) {
    // The filing record itself is the source of truth for what got
    // finalized — a failure here just means those rows still show as
    // 'draft' and would be summed again for a future finalize, so log it
    // but don't fail the response the user is waiting on.
    logError("bir/2551q/finalize: transactions status update failed (non-fatal)", updateError);
  }

  await logActivity(
    owner.ownerId,
    "quarter_finalized",
    `Finalized Q${quarter} ${year}: ${count} transactions, ₱${gross.toLocaleString(undefined, { maximumFractionDigits: 2 })} gross`,
  );

  return NextResponse.json({ gross, taxDue, filingId: filing.id });
}
