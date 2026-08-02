import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { hasBirGuardBusinessAccess } from "@/lib/dashboard/bir-guard-access";
import { logError } from "@/lib/log-error";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }
  if (!(await hasBirGuardBusinessAccess(user.email))) {
    return NextResponse.json({ error: "LOA Tracker is a BUSINESS feature.", code: "BUSINESS_ONLY" }, { status: 403 });
  }

  const { data, error } = await supabaseAdmin
    .from("bir_loa_cases")
    .select("*")
    .eq("user_id", user.id)
    .order("deadline", { ascending: true });

  if (error) {
    logError("bir-guard/loa GET: query failed", error);
    return NextResponse.json({ error: "Failed to load LOA cases." }, { status: 500 });
  }

  return NextResponse.json({ loas: data ?? [] });
}

interface LoaBody {
  loaNo?: unknown;
  rdo?: unknown;
  receivedDate?: unknown;
  deadline?: unknown;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }
  if (!(await hasBirGuardBusinessAccess(user.email))) {
    return NextResponse.json({ error: "LOA Tracker is a BUSINESS feature.", code: "BUSINESS_ONLY" }, { status: 403 });
  }

  let body: LoaBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.loaNo !== "string" || !body.loaNo.trim()) {
    return NextResponse.json({ error: "LOA number is required." }, { status: 400 });
  }
  if (typeof body.rdo !== "string" || !body.rdo.trim()) {
    return NextResponse.json({ error: "RDO is required." }, { status: 400 });
  }
  if (typeof body.receivedDate !== "string" || !body.receivedDate) {
    return NextResponse.json({ error: "Received date is required." }, { status: 400 });
  }
  if (typeof body.deadline !== "string" || !body.deadline) {
    return NextResponse.json({ error: "Deadline is required." }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("bir_loa_cases")
    .insert({
      user_id: user.id,
      loa_no: body.loaNo.trim(),
      rdo: body.rdo.trim(),
      received_date: body.receivedDate,
      deadline: body.deadline,
      status: "open",
    })
    .select()
    .single();

  if (error || !data) {
    logError("bir-guard/loa POST: insert failed", error);
    return NextResponse.json({ error: "Failed to save LOA case." }, { status: 500 });
  }

  return NextResponse.json({ loa: data });
}
