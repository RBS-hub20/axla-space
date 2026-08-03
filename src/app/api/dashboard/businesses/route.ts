import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getBusinesses, createBusiness } from "@/lib/dashboard/businesses";
import { logActivity } from "@/lib/dashboard/activity";
import { getUserPlan, PLAN_LIMITS } from "@/lib/usage";

interface CreateBusinessBody {
  name?: unknown;
  tin?: unknown;
  rdoCode?: unknown;
  branchCode?: unknown;
  address?: unknown;
}

const TIN_DIGITS_RE = /^\d{9,13}$/;
const BRANCH_CODE_RE = /^\d{3}$/;

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canViewFilings) {
    return NextResponse.json({ error: "You don't have permission to view businesses." }, { status: 403 });
  }

  const businesses = await getBusinesses(owner.ownerId);
  return NextResponse.json({ businesses });
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
  if (!owner.permissions.canEditFilings) {
    return NextResponse.json({ error: "You don't have permission to add businesses." }, { status: 403 });
  }

  let body: CreateBusinessBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "Business name is required." }, { status: 400 });
  }

  const tin = typeof body.tin === "string" ? body.tin.trim() : "";
  if (tin && !TIN_DIGITS_RE.test(tin.replace(/[\s-]/g, ""))) {
    return NextResponse.json({ error: "TIN should be 9-13 digits (dashes/spaces OK)." }, { status: 400 });
  }

  const branchCode = typeof body.branchCode === "string" && body.branchCode.trim() ? body.branchCode.trim() : "000";
  if (!BRANCH_CODE_RE.test(branchCode)) {
    return NextResponse.json({ error: "Branch code must be 3 digits, e.g. 000 or 001." }, { status: 400 });
  }

  const plan = await getUserPlan(owner.ownerEmail);
  const maxBusinesses = PLAN_LIMITS.maxBusinesses[plan];
  const existing = await getBusinesses(owner.ownerId);
  if (existing.length >= maxBusinesses) {
    return NextResponse.json(
      {
        code: "LIMIT_REACHED",
        type: "business",
        message:
          plan === "business"
            ? `You've reached the ${maxBusinesses}-business limit on Business plan.`
            : `Free and Pro plans support 1 business. Upgrade to Business (₱1,499/mo) for up to 5.`,
        upgrade_url: "/dashboard/settings",
      },
      { status: 403 },
    );
  }

  const { business, error } = await createBusiness(owner.ownerId, {
    name: body.name.trim(),
    tin,
    rdo_code: typeof body.rdoCode === "string" ? body.rdoCode.trim() : "",
    branch_code: branchCode,
    address: typeof body.address === "string" ? body.address.trim() : "",
  });

  if (!business) {
    const detail = error ? `${error.message} [${error.code}]` : undefined;
    return NextResponse.json({ error: "Failed to create business.", detail }, { status: 500 });
  }

  await logActivity(owner.ownerId, "business_created", `Added business "${business.name}"`);

  return NextResponse.json({ business });
}
