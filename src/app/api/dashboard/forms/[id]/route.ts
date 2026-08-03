import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logActivity } from "@/lib/dashboard/activity";
import { logError } from "@/lib/log-error";

interface RouteParams {
  params: { id: string };
}

export async function GET(_req: Request, { params }: RouteParams) {
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
    .eq("id", params.id)
    .eq("user_id", owner.ownerId)
    .maybeSingle();

  if (error) {
    logError("dashboard/forms/[id] GET: query failed", error);
    return NextResponse.json({ error: "Failed to load form." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  return NextResponse.json({ form: data });
}

interface PatchBody {
  status?: unknown;
}

export async function PATCH(req: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canEditBirForms) {
    return NextResponse.json({ error: "You don't have permission to edit forms." }, { status: 403 });
  }

  let body: PatchBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (body.status !== "filed") {
    return NextResponse.json({ error: "Only 'filed' is supported." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("bir_forms")
    .update({ status: "filed", filed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", params.id)
    .eq("user_id", owner.ownerId)
    .select("*")
    .maybeSingle();

  if (error) {
    logError("dashboard/forms/[id] PATCH: update failed", error);
    return NextResponse.json({ error: "Failed to update form." }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  await logActivity(owner.ownerId, "form_filed", `Marked ${data.form_type} as filed`);

  return NextResponse.json({ form: data });
}
