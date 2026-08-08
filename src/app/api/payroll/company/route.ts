import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getOrCreateProfile } from "@/lib/dashboard/profile";
import { getPayrollCompany } from "@/lib/payroll/company";
import { DEFAULT_DAILY_RATE } from "@/lib/payroll/pricing";
import { logError } from "@/lib/log-error";

const LOGO_BUCKET = "payroll-logos";
const SIGNED_URL_TTL_SECONDS = 3600; // re-signed fresh on every load, so logo_url only ever stores the raw storage path.

/** Company setup is free for every logged-in user, no plan check — it's the one-time onboarding step before anything else in the dashboard is usable. */
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

  const [company, profile] = await Promise.all([
    getPayrollCompany(owner.ownerId),
    getOrCreateProfile(owner.ownerId, owner.ownerEmail, user.name ?? owner.ownerEmail.split("@")[0]),
  ]);

  let logoSignedUrl: string | null = null;
  if (company?.logo_url) {
    const { data: signed } = await supabaseAdmin.storage.from(LOGO_BUCKET).createSignedUrl(company.logo_url, SIGNED_URL_TTL_SECONDS);
    logoSignedUrl = signed?.signedUrl ?? null;
  }

  return NextResponse.json({
    company: company ? { ...company, logo_signed_url: logoSignedUrl } : null,
    prefill: {
      businessName: profile?.business_name?.trim() || profile?.full_name?.trim() || "",
    },
  });
}

interface CompanyBody {
  businessName?: unknown;
  rdoCode?: unknown;
  tin?: unknown;
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

  let body: CompanyBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.businessName !== "string" || !body.businessName.trim()) {
    return NextResponse.json({ error: "Business name is required." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("payroll_companies")
    .upsert(
      {
        owner_id: owner.ownerId,
        business_name: body.businessName.trim().slice(0, 160),
        rdo_code: typeof body.rdoCode === "string" && body.rdoCode.trim() ? body.rdoCode.trim().slice(0, 60) : null,
        min_wage: DEFAULT_DAILY_RATE,
        tin: typeof body.tin === "string" && body.tin.trim() ? body.tin.trim().slice(0, 20) : null,
      },
      { onConflict: "owner_id" },
    )
    .select()
    .single();

  if (error || !data) {
    logError("payroll/company POST: upsert failed", error);
    return NextResponse.json({ error: "Failed to save company." }, { status: 500 });
  }

  return NextResponse.json({ company: data });
}
