import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/admin-session";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

export interface ReferralStats {
  countsByEmail: Record<string, number>;
  topReferrer: { email: string; count: number } | null;
}

export async function GET() {
  const session = cookies().get(ADMIN_SESSION_COOKIE)?.value;
  if (!verifySessionToken(session)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  // referral_clicks may not exist yet on a database that hasn't run
  // migration 009 — fail open with an empty stats payload rather than 500,
  // same fail-open pattern used for other newly-added optional tables.
  const { data, error } = await supabaseAdmin
    .from("referral_clicks")
    .select("ref_email")
    .not("ref_email", "is", null);

  if (error) {
    logError("referral/stats: Supabase query failed (non-fatal, returning empty stats)", error);
    return NextResponse.json({ countsByEmail: {}, topReferrer: null } satisfies ReferralStats);
  }

  const countsByEmail: Record<string, number> = {};
  for (const row of data ?? []) {
    const email = row.ref_email as string;
    countsByEmail[email] = (countsByEmail[email] ?? 0) + 1;
  }

  let topReferrer: ReferralStats["topReferrer"] = null;
  for (const [email, count] of Object.entries(countsByEmail)) {
    if (!topReferrer || count > topReferrer.count) topReferrer = { email, count };
  }

  return NextResponse.json({ countsByEmail, topReferrer } satisfies ReferralStats);
}
