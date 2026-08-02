import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { hasBirGuardBusinessAccess } from "@/lib/dashboard/bir-guard-access";
import { RDO_LIST } from "@/lib/dashboard/rdo-list";
import { logError } from "@/lib/log-error";

/** One active RDO-transfer draft per user — GET returns it (or empty defaults), PUT upserts it. */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }
  if (!(await hasBirGuardBusinessAccess(user.email))) {
    return NextResponse.json({ error: "RDO Transfer is a BUSINESS feature.", code: "BUSINESS_ONLY" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin.from("bir_rdo_transfers").select("*").eq("user_id", user.id).maybeSingle();

  if (error) {
    logError("bir-guard/rdo-transfer GET: query failed", error);
    return NextResponse.json({ error: "Failed to load RDO transfer draft." }, { status: 500 });
  }

  return NextResponse.json({
    transfer: data ?? { from_rdo_code: "", from_rdo_name: "", to_rdo_code: "", to_rdo_name: "", checklist: {} },
  });
}

interface TransferBody {
  fromRdoCode?: unknown;
  toRdoCode?: unknown;
  checklist?: unknown;
}

export async function PUT(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }
  if (!(await hasBirGuardBusinessAccess(user.email))) {
    return NextResponse.json({ error: "RDO Transfer is a BUSINESS feature.", code: "BUSINESS_ONLY" }, { status: 403 });
  }

  let body: TransferBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  // Both fields optional (a user may only have picked one side so far), but
  // if a code is present it must be a real RDO — the name is always resolved
  // from RDO_LIST server-side, never trusted from the client, so the two can
  // never drift apart.
  let fromRdo = { code: "", name: "" };
  if (typeof body.fromRdoCode === "string" && body.fromRdoCode) {
    const match = RDO_LIST.find((r) => r.code === body.fromRdoCode);
    if (!match) return NextResponse.json({ error: "Invalid From RDO code." }, { status: 400 });
    fromRdo = match;
  }
  let toRdo = { code: "", name: "" };
  if (typeof body.toRdoCode === "string" && body.toRdoCode) {
    const match = RDO_LIST.find((r) => r.code === body.toRdoCode);
    if (!match) return NextResponse.json({ error: "Invalid To RDO code." }, { status: 400 });
    toRdo = match;
  }

  const checklist =
    body.checklist && typeof body.checklist === "object" && !Array.isArray(body.checklist)
      ? (body.checklist as Record<string, boolean>)
      : {};

  const { data, error } = await supabaseAdmin
    .from("bir_rdo_transfers")
    .upsert(
      {
        user_id: user.id,
        from_rdo_code: fromRdo.code,
        from_rdo_name: fromRdo.name,
        to_rdo_code: toRdo.code,
        to_rdo_name: toRdo.name,
        checklist,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select()
    .single();

  if (error || !data) {
    logError("bir-guard/rdo-transfer PUT: upsert failed", error);
    return NextResponse.json({ error: "Failed to save RDO transfer draft." }, { status: 500 });
  }

  return NextResponse.json({ transfer: data });
}
