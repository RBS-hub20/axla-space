import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getPayrollPlan } from "@/lib/payroll/plan";
import { PAYROLL_STAFF_LIMITS, DEFAULT_DAILY_RATE } from "@/lib/payroll/pricing";
import { logError } from "@/lib/log-error";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const plan = await getPayrollPlan(user.email);
  if (!plan) {
    return NextResponse.json({ error: "No active Payroll subscription.", code: "NO_SUBSCRIPTION" }, { status: 403 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const { data, error } = await supabaseAdmin
    .from("payroll_staff")
    .select("*")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    logError("payroll/staff GET: query failed", error);
    return NextResponse.json({ error: "Failed to load staff." }, { status: 500 });
  }

  return NextResponse.json({ staff: data ?? [], plan, limit: PAYROLL_STAFF_LIMITS[plan] });
}

interface StaffBody {
  name?: unknown;
  gcash?: unknown;
  dailyRate?: unknown;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const plan = await getPayrollPlan(user.email);
  if (!plan) {
    return NextResponse.json({ error: "No active Payroll subscription.", code: "NO_SUBSCRIPTION" }, { status: 403 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const limit = PAYROLL_STAFF_LIMITS[plan];
  if (limit !== null) {
    const { count, error: countError } = await supabaseAdmin
      .from("payroll_staff")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", user.id);
    if (countError) {
      logError("payroll/staff POST: count check failed", countError);
      return NextResponse.json({ error: "Failed to check staff limit." }, { status: 500 });
    }
    if ((count ?? 0) >= limit) {
      return NextResponse.json(
        { error: `Your plan is capped at ${limit} staff — upgrade for more.`, code: "STAFF_LIMIT_REACHED" },
        { status: 403 },
      );
    }
  }

  let body: StaffBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "Staff name is required." }, { status: 400 });
  }
  const dailyRate = body.dailyRate !== undefined ? Number(body.dailyRate) : DEFAULT_DAILY_RATE;
  if (!Number.isFinite(dailyRate) || dailyRate <= 0) {
    return NextResponse.json({ error: "Daily rate must be a positive number." }, { status: 400 });
  }
  const gcash = typeof body.gcash === "string" ? body.gcash.trim().slice(0, 20) : null;

  const { data, error } = await supabaseAdmin
    .from("payroll_staff")
    .insert({ owner_id: user.id, name: body.name.trim().slice(0, 120), gcash, daily_rate: dailyRate })
    .select()
    .single();

  if (error || !data) {
    logError("payroll/staff POST: insert failed", error);
    return NextResponse.json({ error: "Failed to add staff." }, { status: 500 });
  }

  return NextResponse.json({ staff: data });
}
