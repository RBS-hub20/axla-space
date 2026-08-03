import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { updateBusiness, setPrimaryBusiness, deleteBusiness } from "@/lib/dashboard/businesses";
import { logActivity } from "@/lib/dashboard/activity";

interface RouteParams {
  params: { id: string };
}

interface PatchBody {
  name?: unknown;
  tin?: unknown;
  rdoCode?: unknown;
  branchCode?: unknown;
  address?: unknown;
  isPrimary?: unknown;
}

const TIN_DIGITS_RE = /^\d{9,13}$/;
const BRANCH_CODE_RE = /^\d{3}$/;

export async function PATCH(req: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canEditFilings) {
    return NextResponse.json({ error: "You don't have permission to edit businesses." }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Setting primary is a distinct operation (two sequential updates under
  // the hood) — handle it on its own rather than mixing it into a partial
  // field update.
  if (body.isPrimary === true) {
    const { business, error } = await setPrimaryBusiness(owner.ownerId, params.id);
    if (!business) {
      const detail = error ? `${error.message} [${error.code}]` : undefined;
      return NextResponse.json({ error: "Failed to set primary business.", detail }, { status: 500 });
    }
    await logActivity(owner.ownerId, "business_set_primary", `Set "${business.name}" as primary business`);
    return NextResponse.json({ business });
  }

  const updates: Record<string, string> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return NextResponse.json({ error: "Business name can't be empty." }, { status: 400 });
    }
    updates.name = body.name.trim();
  }

  if (body.tin !== undefined) {
    if (typeof body.tin !== "string") {
      return NextResponse.json({ error: "Invalid TIN." }, { status: 400 });
    }
    const trimmed = body.tin.trim();
    if (trimmed && !TIN_DIGITS_RE.test(trimmed.replace(/[\s-]/g, ""))) {
      return NextResponse.json({ error: "TIN should be 9-13 digits (dashes/spaces OK)." }, { status: 400 });
    }
    updates.tin = trimmed;
  }

  if (body.rdoCode !== undefined) {
    if (typeof body.rdoCode !== "string") {
      return NextResponse.json({ error: "Invalid RDO code." }, { status: 400 });
    }
    updates.rdo_code = body.rdoCode.trim();
  }

  if (body.branchCode !== undefined) {
    if (typeof body.branchCode !== "string" || !BRANCH_CODE_RE.test(body.branchCode.trim())) {
      return NextResponse.json({ error: "Branch code must be 3 digits, e.g. 000 or 001." }, { status: 400 });
    }
    updates.branch_code = body.branchCode.trim();
  }

  if (body.address !== undefined) {
    if (typeof body.address !== "string") {
      return NextResponse.json({ error: "Invalid address." }, { status: 400 });
    }
    updates.address = body.address.trim();
  }

  const { business, error } = await updateBusiness(owner.ownerId, params.id, updates);
  if (!business) {
    const detail = error ? `${error.message} [${error.code}]` : undefined;
    return NextResponse.json({ error: "Failed to update business.", detail }, { status: 500 });
  }

  await logActivity(owner.ownerId, "business_updated", `Updated business "${business.name}"`);

  return NextResponse.json({ business });
}

export async function DELETE(_req: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canDeleteShop) {
    return NextResponse.json({ error: "Only the account owner can delete a business." }, { status: 403 });
  }

  const { success, error } = await deleteBusiness(owner.ownerId, params.id);
  if (!success) {
    const detail = error ? `${error.message} [${error.code}]` : undefined;
    return NextResponse.json({ error: "Failed to delete business.", detail }, { status: 500 });
  }

  await logActivity(owner.ownerId, "business_deleted", "Deleted a business");

  return NextResponse.json({ success: true });
}
