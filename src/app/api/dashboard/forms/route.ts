import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/dashboard/activity";
import { logError } from "@/lib/log-error";
import { getFilingDeadline, getQuarterLabel, isOverdue } from "@/lib/dashboard/quarter";
import { checkAndIncrementUsage, LIMIT_MESSAGES } from "@/lib/usage";

const FORM_TYPES = ["2551Q", "1701Q", "0619E"];

interface CreateFormBody {
  formType?: unknown;
  calculationId?: unknown;
}

/** Adds a computed deadline/overdue flag per form — kept server-side since
 * the underlying date math lives in a `server-only` module the client
 * bundle can't import directly. */
function enrichForm(form: Record<string, unknown>) {
  const calc = (form.data ?? {}) as Record<string, unknown>;
  const quarter = (Number(calc.quarter) || 1) as 1 | 2 | 3 | 4;
  const year = Number(calc.year) || new Date().getFullYear();
  const formType = (form.form_type as string) === "2551Q" ? "2551Q" : "1701Q";
  const deadline = getFilingDeadline(quarter, year, formType);

  return {
    ...form,
    quarter,
    year,
    quarter_label: getQuarterLabel(quarter, year),
    deadline: deadline.toISOString(),
    is_overdue: form.status === "draft" && isOverdue(deadline),
  };
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canViewBirForms) {
    return NextResponse.json({ error: "You don't have permission to view forms." }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("bir_forms")
    .select("*")
    .eq("user_id", owner.ownerId)
    .order("created_at", { ascending: false });

  if (error) {
    logError("dashboard/forms GET: query failed", error);
    return NextResponse.json({ error: "Failed to load forms." }, { status: 500 });
  }

  return NextResponse.json({ forms: (data ?? []).map(enrichForm) });
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canEditBirForms) {
    return NextResponse.json({ error: "You don't have permission to create forms." }, { status: 403 });
  }

  let body: CreateFormBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const formType = body.formType as string;
  if (!FORM_TYPES.includes(formType)) {
    return NextResponse.json({ error: "Invalid form type." }, { status: 400 });
  }

  // Checked (and, if allowed, incremented) only after body validation — an
  // invalid request should never spend a free-tier user's one filing/quarter.
  const usage = await checkAndIncrementUsage(owner.ownerId, owner.ownerEmail, "filing");
  if (!usage.allowed) {
    return NextResponse.json(
      { code: "LIMIT_REACHED", type: "filing", message: LIMIT_MESSAGES.filing, upgrade_url: "/dashboard/settings" },
      { status: 403 },
    );
  }

  // Auto-fill from the caller's most recent calculation, or their latest
  // overall calculation if no specific one was given.
  let calculationId = typeof body.calculationId === "string" ? body.calculationId : null;
  let calcData: Record<string, unknown> | null = null;

  const calcQuery = supabaseAdmin.from("tax_calculations").select("*").eq("user_id", owner.ownerId);
  const { data: calc, error: calcError } = calculationId
    ? await calcQuery.eq("id", calculationId).maybeSingle()
    : await calcQuery.order("created_at", { ascending: false }).limit(1).maybeSingle();

  if (calcError) {
    logError("dashboard/forms POST: calc lookup failed", calcError);
  } else if (calc) {
    calculationId = calc.id;
    calcData = calc;
  }

  const { data, error } = await supabaseAdmin
    .from("bir_forms")
    .insert({
      user_id: owner.ownerId,
      form_type: formType,
      status: "draft",
      calculation_id: calculationId,
      data: calcData ?? {},
    })
    .select("*")
    .single();

  if (error) {
    logError("dashboard/forms POST: insert failed", error);
    return NextResponse.json({ error: "Failed to create form." }, { status: 500 });
  }

  await logActivity(owner.ownerId, "form_created", `Created a new ${formType} draft`);

  return NextResponse.json({ form: enrichForm(data) });
}
