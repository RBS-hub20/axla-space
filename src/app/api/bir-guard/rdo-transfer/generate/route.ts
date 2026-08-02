import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { hasBirGuardBusinessAccess } from "@/lib/dashboard/bir-guard-access";
import { getOrCreateProfile } from "@/lib/dashboard/profile";
import { generateRdoTransferPdf } from "@/lib/pdf/generate-toolkit-pdf";
import { RDO_CHECKLIST_ITEMS } from "@/lib/bir-guard/rdo-checklist";
import { logError } from "@/lib/log-error";

/**
 * No manual fields, ever — everything is pulled from the caller's own
 * profile (full_name, tin_number, address) and their saved RDO Transfer
 * draft (from/to RDO, checklist). If required profile fields are missing
 * this 400s with PROFILE_INCOMPLETE so the client shows a banner pointing
 * at Settings; it never falls back to asking for the missing data here.
 */
export async function GET(req: Request) {
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

  const [profile, { data: transfer, error: transferError }] = await Promise.all([
    getOrCreateProfile(user.id, user.email, user.name ?? user.email.split("@")[0]),
    supabaseAdmin.from("bir_rdo_transfers").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  if (!profile) {
    return NextResponse.json({ error: "Failed to load profile." }, { status: 500 });
  }
  if (transferError) {
    logError("bir-guard/rdo-transfer/generate: transfer lookup failed", transferError);
    return NextResponse.json({ error: "Failed to load RDO transfer draft." }, { status: 500 });
  }

  if (!profile.full_name?.trim() || !profile.tin_number?.trim() || !profile.address?.trim()) {
    return NextResponse.json(
      { error: "Complete your profile in Settings to auto-generate the 1905.", code: "PROFILE_INCOMPLETE" },
      { status: 400 },
    );
  }
  if (!transfer?.from_rdo_code || !transfer?.to_rdo_code) {
    return NextResponse.json(
      { error: "Select and save From/To RDO first.", code: "RDO_NOT_SELECTED" },
      { status: 400 },
    );
  }

  try {
    const checklistState = (transfer.checklist ?? {}) as Record<string, boolean>;
    const bytes = await generateRdoTransferPdf({
      fullName: profile.full_name.trim(),
      businessName: profile.business_name?.trim() ?? "",
      tin: profile.tin_number.trim(),
      address: profile.address.trim(),
      fromRdoCode: transfer.from_rdo_code,
      fromRdoName: transfer.from_rdo_name,
      toRdoCode: transfer.to_rdo_code,
      toRdoName: transfer.to_rdo_name,
      checklist: RDO_CHECKLIST_ITEMS.map((item) => ({ label: item.label, checked: Boolean(checklistState[item.id]) })),
    });

    const download = new URL(req.url).searchParams.get("download") === "1";
    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="axla-rdo-transfer-1905.pdf"`,
      },
    });
  } catch (err) {
    logError("bir-guard/rdo-transfer/generate: PDF generation failed", err);
    return NextResponse.json({ error: "Couldn't generate the document. Please try again." }, { status: 500 });
  }
}
