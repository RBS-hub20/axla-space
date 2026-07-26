import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

interface TrackBody {
  page?: unknown;
  referrer?: unknown;
  utm_source?: unknown;
  utm_medium?: unknown;
  utm_campaign?: unknown;
  device?: unknown;
}

/**
 * Anonymous page-view beacon for the public landing page only — /admin,
 * /dashboard, and /api are excluded here AND in the client tracker
 * (src/components/analytics/PageViewTracker.tsx) as a belt-and-suspenders
 * pair, per "wag isama yung /admin, ako lang naman nakaka-access doon."
 * IP is hashed (never stored raw) — this is a visit counter, not a
 * per-person tracking system.
 */
export async function POST(req: Request) {
  try {
    const body: TrackBody = await req.json();
    const page = typeof body.page === "string" ? body.page : "";

    if (!page || page.startsWith("/admin") || page.startsWith("/dashboard") || page.startsWith("/api")) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    if (!isSupabaseAdminConfigured) {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "0.0.0.0";
    const ip_hash = createHash("sha256").update(ip).digest("hex").slice(0, 16);
    const country = req.headers.get("x-vercel-ip-country") || req.headers.get("x-vercel-ip-city") || null;

    const { error } = await supabaseAdmin.from("page_views").insert({
      page: page.slice(0, 100),
      referrer: typeof body.referrer === "string" ? body.referrer.slice(0, 200) : null,
      utm_source: typeof body.utm_source === "string" ? body.utm_source.slice(0, 50) : null,
      utm_medium: typeof body.utm_medium === "string" ? body.utm_medium.slice(0, 50) : null,
      utm_campaign: typeof body.utm_campaign === "string" ? body.utm_campaign.slice(0, 50) : null,
      country,
      device: typeof body.device === "string" ? body.device.slice(0, 20) : null,
      ip_hash,
    });

    if (error) logError("analytics/track: insert failed (non-fatal)", error);

    return NextResponse.json({ ok: true });
  } catch (err) {
    // Never let a tracking beacon surface an error to the visitor's browser.
    logError("analytics/track: request failed (non-fatal)", err);
    return NextResponse.json({ ok: true });
  }
}
