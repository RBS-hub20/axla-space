import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner, maskTin } from "@/lib/team";
import { getOrCreateProfile, updateProfile, type ProfileUpdate } from "@/lib/dashboard/profile";
import { isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/dashboard/activity";
import type { TaxType } from "@/lib/tax-calculator";

const TAX_TYPES: TaxType[] = ["8%", "3%", "itemized"];

// Loose check, not a strict BIR format validator: 9-13 digits once
// dashes/spaces are stripped, which covers the base 9-digit TIN and the
// 3-4 digit branch-code suffix some forms ask for. Deliberately permissive
// — rejecting a real TIN because of an edge case we didn't anticipate is
// worse than letting a slightly malformed one through.
const TIN_DIGITS_RE = /^\d{9,13}$/;

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
    return NextResponse.json({ error: "You don't have permission to view this profile." }, { status: 403 });
  }

  const profile = await getOrCreateProfile(owner.ownerId, owner.ownerEmail, owner.ownerEmail.split("@")[0]);
  if (!profile) {
    return NextResponse.json({ error: "Failed to load profile." }, { status: 500 });
  }

  // TIN is masked here, not just hidden client-side, so it never actually
  // reaches a shared accountant/VA/team_leader session's network tab.
  const visibleProfile = owner.permissions.canEditSettings
    ? profile
    : { ...profile, tin_number: profile.tin_number ? maskTin(profile.tin_number) : profile.tin_number };

  return NextResponse.json({ profile: visibleProfile });
}

interface PatchBody {
  fullName?: unknown;
  businessName?: unknown;
  tinNumber?: unknown;
  address?: unknown;
  taxType?: unknown;
  rdoCode?: unknown;
}

export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canEditSettings) {
    return NextResponse.json({ error: "You don't have permission to edit this profile." }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const updates: ProfileUpdate = {};

  if (body.fullName !== undefined) {
    if (typeof body.fullName !== "string" || !body.fullName.trim()) {
      return NextResponse.json({ error: "Name can't be empty." }, { status: 400 });
    }
    updates.full_name = body.fullName.trim();
  }

  if (body.businessName !== undefined) {
    if (typeof body.businessName !== "string") {
      return NextResponse.json({ error: "Invalid business name." }, { status: 400 });
    }
    updates.business_name = body.businessName.trim();
  }

  if (body.tinNumber !== undefined) {
    if (typeof body.tinNumber !== "string") {
      return NextResponse.json({ error: "Invalid TIN." }, { status: 400 });
    }
    const trimmed = body.tinNumber.trim();
    if (trimmed && !TIN_DIGITS_RE.test(trimmed.replace(/[\s-]/g, ""))) {
      return NextResponse.json(
        { error: "TIN should be 9-13 digits (dashes/spaces OK), e.g. 123-456-789-000." },
        { status: 400 },
      );
    }
    updates.tin_number = trimmed;
  }

  if (body.address !== undefined) {
    if (typeof body.address !== "string") {
      return NextResponse.json({ error: "Invalid address." }, { status: 400 });
    }
    updates.address = body.address.trim();
  }

  if (body.taxType !== undefined) {
    if (!TAX_TYPES.includes(body.taxType as TaxType)) {
      return NextResponse.json({ error: "Invalid tax type." }, { status: 400 });
    }
    updates.tax_type = body.taxType as TaxType;
  }

  if (body.rdoCode !== undefined) {
    if (typeof body.rdoCode !== "string") {
      return NextResponse.json({ error: "Invalid RDO code." }, { status: 400 });
    }
    updates.rdo_code = body.rdoCode.trim();
  }

  const { profile, error } = await updateProfile(owner.ownerId, updates);
  if (!profile) {
    const detail = error ? `${error.message}${error.hint ? ` (hint: ${error.hint})` : ""} [${error.code}]` : undefined;
    return NextResponse.json({ error: "Failed to update profile.", detail }, { status: 500 });
  }

  await logActivity(owner.ownerId, "profile_updated", "Updated profile settings");

  return NextResponse.json({ profile });
}
