import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ADMIN_SESSION_COOKIE, verifySessionToken } from "@/lib/admin-session";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

const LIVE_WINDOW_MS = 5 * 60 * 1000;

interface PageViewRow {
  page: string;
  referrer: string | null;
  utm_source: string | null;
  device: string | null;
  created_at: string;
}

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Top N by count, descending — shared by referrers/utm_sources/devices below. */
function topCounts(values: (string | null)[], limit: number): { value: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/**
 * Admin-only visitor analytics for the public landing page — same
 * ADMIN_SESSION_COOKIE check /api/admin/payments uses (this app has no
 * Supabase Auth session anywhere; every admin route gates on that
 * password-derived cookie, not a Supabase user/email check).
 */
export async function GET() {
  const session = cookies().get(ADMIN_SESSION_COOKIE)?.value;
  if (!verifySessionToken(session)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
  const sevenDaysAgo = new Date(todayStart.getTime() - 7 * 86_400_000);
  const thirtyDaysAgo = new Date(todayStart.getTime() - 30 * 86_400_000);
  const liveThreshold = new Date(now.getTime() - LIVE_WINDOW_MS);

  const [last30Result, subsResult] = await Promise.all([
    supabaseAdmin
      .from("page_views")
      .select("page, referrer, utm_source, device, created_at")
      .gte("created_at", thirtyDaysAgo.toISOString()),
    supabaseAdmin.from("subscriptions").select("created_at").gte("created_at", thirtyDaysAgo.toISOString()),
  ]);

  if (last30Result.error) {
    logError("admin/analytics: page_views query failed", last30Result.error);
    return NextResponse.json({ error: "Failed to load analytics." }, { status: 500 });
  }
  if (subsResult.error) {
    logError("admin/analytics: subscriptions query failed (non-fatal, conversionRate will be 0)", subsResult.error);
  }

  const views = (last30Result.data ?? []) as PageViewRow[];

  const today = views.filter((v) => new Date(v.created_at) >= todayStart).length;
  const yesterday = views.filter((v) => {
    const t = new Date(v.created_at);
    return t >= yesterdayStart && t < todayStart;
  }).length;
  const live = views.filter((v) => new Date(v.created_at) >= liveThreshold).length;
  const visitorsLast7Days = views.filter((v) => new Date(v.created_at) >= sevenDaysAgo).length;
  const visitorsLast30Days = views.length;

  const last7Days: { date: string; count: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(todayStart.getTime() - i * 86_400_000);
    const key = dayKey(day);
    const count = views.filter((v) => dayKey(new Date(v.created_at)) === key).length;
    last7Days.push({ date: key, count });
  }

  const topReferrers = topCounts(views.map((v) => v.referrer), 5);
  const utmSources = topCounts(views.map((v) => v.utm_source), 5);
  const devices = topCounts(views.map((v) => v.device), 5);

  const paidLast30Days = subsResult.data?.length ?? 0;
  const conversionRate = visitorsLast30Days > 0 ? Math.round((paidLast30Days / visitorsLast30Days) * 1000) / 10 : 0;

  return NextResponse.json({
    today,
    yesterday,
    live,
    visitorsLast7Days,
    last7Days,
    topReferrers,
    utmSources,
    devices,
    paidLast30Days,
    visitorsLast30Days,
    conversionRate,
  });
}
