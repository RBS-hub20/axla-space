import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { hasBirGuardAccess } from "@/lib/dashboard/bir-guard-access";
import { getOrCreateProfile } from "@/lib/dashboard/profile";
import { logError } from "@/lib/log-error";

interface DraftLetterBody {
  caseId?: unknown;
}

/**
 * Stub — a plain template filled in with the case's real data, not an AI
 * generation call. Deliberately not wired to Axla Brain AI yet: an
 * AI-drafted letter to a tax authority is exactly the kind of content
 * where a hallucinated claim or figure could actually hurt the user if
 * they submitted it as-is, and that needs its own careful pass (review
 * flow, explicit "AI draft, verify before sending" framing, maybe a
 * disclaimer baked into the output) rather than being bolted on here.
 * This gives a real, usable starting point in the meantime — always
 * returned as an editable draft, never auto-submitted anywhere.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  if (!(await hasBirGuardAccess(user.email))) {
    return NextResponse.json({ error: "BIR Guard is a PRO feature.", code: "UPGRADE_REQUIRED" }, { status: 403 });
  }

  let body: DraftLetterBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (typeof body.caseId !== "string" || !body.caseId) {
    return NextResponse.json({ error: "caseId is required." }, { status: 400 });
  }

  const { data: birCase, error } = await supabaseAdmin
    .from("bir_open_cases")
    .select("*")
    .eq("id", body.caseId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) {
    logError("bir-guard/draft-letter POST: case lookup failed", error);
    return NextResponse.json({ error: "Failed to load case." }, { status: 500 });
  }
  if (!birCase) {
    return NextResponse.json({ error: "Case not found." }, { status: 404 });
  }

  const profile = await getOrCreateProfile(user.id, user.email, user.name ?? user.email.split("@")[0]);
  const today = new Date().toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });

  const letter = `${today}

Revenue District Office ${profile?.rdo_code || "[RDO CODE]"}
Bureau of Internal Revenue

Subject: Re: ${birCase.form_type} — ${birCase.tax_period}${birCase.penalty_amount > 0 ? ` (Penalty Assessment)` : ""}

Dear Sir/Madam,

I am writing regarding the above-referenced ${birCase.form_type} for the period ${birCase.tax_period}${
    birCase.penalty_amount > 0
      ? `, for which a penalty of ₱${Number(birCase.penalty_amount).toLocaleString(undefined, { maximumFractionDigits: 2 })} has been noted on my account`
      : ""
  }.

[Explain your situation here — e.g., reason for late filing, request for penalty abatement, or clarification being sought. Reference any supporting documents you're attaching.]

Taxpayer Name: ${profile?.full_name || "[YOUR NAME]"}
TIN: ${profile?.tin_number || "[YOUR TIN]"}

Respectfully,

${profile?.full_name || "[YOUR NAME]"}

---
⚠️ This is an editable DRAFT template, not a submitted or verified document. Review every bracketed field and the full text carefully — and consider having an accountant check it — before printing, signing, or filing this with BIR.`;

  return NextResponse.json({ draft: letter });
}
