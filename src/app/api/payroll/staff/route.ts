import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getPayrollPlan } from "@/lib/payroll/plan";
import { PAYROLL_STAFF_LIMITS, DEFAULT_DAILY_RATE, tierOf } from "@/lib/payroll/pricing";
import { generateClockToken } from "@/lib/payroll/clock-token";
import { EMPLOYMENT_TYPES, RATE_TYPES, STAFF_STATUSES, type RateType } from "@/lib/payroll/staff-fields";
import { logError } from "@/lib/log-error";

const digitsOnly = (s: string) => s.replace(/\D/g, "");

/** Freemium — every logged-in user can view/add staff, free tier just capped at 1 (see PAYROLL_STAFF_LIMITS). No plan required to reach this route at all. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canViewPayroll) {
    return NextResponse.json({ error: "You don't have permission to view payroll." }, { status: 403 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }
  const plan = await getPayrollPlan(owner.ownerEmail);
  const tier = tierOf(plan);

  const { data, error } = await supabaseAdmin
    .from("payroll_staff")
    .select("*")
    .eq("owner_id", owner.ownerId)
    .order("created_at", { ascending: false });

  if (error) {
    logError("payroll/staff GET: query failed", error);
    return NextResponse.json({ error: "Failed to load staff." }, { status: 500 });
  }

  let staff = data ?? [];
  const avatarPaths = staff.filter((s) => s.avatar_url).map((s) => s.avatar_url as string);
  if (avatarPaths.length > 0) {
    const { data: signedList } = await supabaseAdmin.storage.from("payroll-staff-avatars").createSignedUrls(avatarPaths, 3600);
    const signedByPath = new Map((signedList ?? []).map((s) => [s.path, s.signedUrl]));
    staff = staff.map((s) => ({ ...s, avatar_signed_url: s.avatar_url ? (signedByPath.get(s.avatar_url) ?? null) : null }));
  }

  return NextResponse.json({ staff, plan, limit: PAYROLL_STAFF_LIMITS[tier] });
}

interface StaffBody {
  name?: unknown;
  gcash?: unknown;
  phone?: unknown;
  dailyRate?: unknown;
  position?: unknown;
  employmentType?: unknown;
  rateType?: unknown;
  rateAmount?: unknown;
  schedule?: unknown;
  status?: unknown;
  hiredAt?: unknown;
}

/** rate_type='daily' keeps daily_rate (what the Run engine actually computes with) in sync with rate_amount — the other rate types are display-only for now, so daily_rate falls back to the standard default rather than being set to a meaningless hourly/monthly figure. */
function resolveDailyRate(rateType: RateType, rateAmount: number): number {
  return rateType === "daily" ? rateAmount : DEFAULT_DAILY_RATE;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canEditPayroll) {
    return NextResponse.json({ error: "You don't have permission to edit payroll." }, { status: 403 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }
  const plan = await getPayrollPlan(owner.ownerEmail);
  const tier = tierOf(plan);

  const limit = PAYROLL_STAFF_LIMITS[tier];
  if (limit !== null) {
    const { count, error: countError } = await supabaseAdmin
      .from("payroll_staff")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", owner.ownerId);
    if (countError) {
      logError("payroll/staff POST: count check failed", countError);
      return NextResponse.json({ error: "Failed to check staff limit." }, { status: 500 });
    }
    if ((count ?? 0) >= limit) {
      return NextResponse.json(
        {
          error:
            tier === "free"
              ? "Upgrade to Starter ₱149/mo for up to 5 staff."
              : `Your plan is capped at ${limit} staff — upgrade for more.`,
          code: "STAFF_LIMIT_REACHED",
        },
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

  const rateType: RateType = RATE_TYPES.includes(body.rateType as RateType) ? (body.rateType as RateType) : "daily";
  const rateAmount = body.rateAmount !== undefined ? Number(body.rateAmount) : body.dailyRate !== undefined ? Number(body.dailyRate) : DEFAULT_DAILY_RATE;
  if (!Number.isFinite(rateAmount) || rateAmount <= 0) {
    return NextResponse.json({ error: "Rate must be a positive number." }, { status: 400 });
  }
  const gcash = typeof body.gcash === "string" ? body.gcash.trim().slice(0, 20) || null : null;
  const phone = typeof body.phone === "string" ? body.phone.trim().slice(0, 20) || null : null;
  const position = typeof body.position === "string" ? body.position.trim().slice(0, 60) || null : null;
  const employmentType =
    typeof body.employmentType === "string" && (EMPLOYMENT_TYPES as readonly string[]).includes(body.employmentType) ? body.employmentType : "Regular";
  const schedule = typeof body.schedule === "string" ? body.schedule.trim().slice(0, 120) || null : null;
  const status = typeof body.status === "string" && (STAFF_STATUSES as readonly string[]).includes(body.status) ? body.status : "Active";
  const hiredAt = typeof body.hiredAt === "string" && body.hiredAt.trim() ? body.hiredAt.trim() : null;

  if (gcash) {
    const normalized = digitsOnly(gcash);
    const { data: existingStaff, error: existingError } = await supabaseAdmin
      .from("payroll_staff")
      .select("id, name, gcash")
      .eq("owner_id", owner.ownerId)
      .not("gcash", "is", null);
    if (existingError) {
      logError("payroll/staff POST: duplicate check failed", existingError);
      return NextResponse.json({ error: "Failed to add staff." }, { status: 500 });
    }
    const duplicate = existingStaff?.find((s) => digitsOnly(s.gcash ?? "") === normalized && normalized.length > 0);
    if (duplicate) {
      return NextResponse.json(
        { error: `This GCash number is already used by ${duplicate.name}.`, code: "DUPLICATE_GCASH" },
        { status: 409 },
      );
    }
  }

  // Retried on the rare token collision (~1-in-billions at 54^8, but the
  // unique index is the real guarantee — this loop just makes a collision
  // self-heal instead of failing the whole "add staff" request).
  let staffRow = null;
  let insertError = null;
  for (let attempt = 0; attempt < 5 && !staffRow; attempt++) {
    const { data, error } = await supabaseAdmin
      .from("payroll_staff")
      .insert({
        owner_id: owner.ownerId,
        name: body.name.trim().slice(0, 120),
        gcash,
        phone,
        position,
        employment_type: employmentType,
        rate_type: rateType,
        rate_amount: rateAmount,
        daily_rate: resolveDailyRate(rateType, rateAmount),
        schedule,
        status,
        hired_at: hiredAt,
        clock_token: generateClockToken(),
      })
      .select()
      .single();
    if (!error) {
      staffRow = data;
      break;
    }
    insertError = error;
    if (error.code !== "23505") break;
  }

  if (!staffRow) {
    logError("payroll/staff POST: insert failed", insertError);
    return NextResponse.json({ error: "Failed to add staff." }, { status: 500 });
  }

  return NextResponse.json({ staff: staffRow });
}
