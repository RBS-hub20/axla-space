import { NextResponse } from "next/server";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getOrRotateShopSettings } from "@/lib/payroll/shop-settings";
import { haversineMeters } from "@/lib/payroll/geo";
import { getClientIp } from "@/lib/rate-limit";
import { logError } from "@/lib/log-error";

const RATE_LIMIT_MS = 5 * 60 * 1000;
const MAX_SELFIE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_SELFIE_TYPES = ["image/jpeg", "image/png", "image/webp"];
const BUCKET = "payroll-selfies";

// POST handlers are already excluded from Next's Full Route Cache, but the
// rate-limit check and shop-settings read here are exactly the kind of
// per-request-must-be-live query that bit employee/by-token/route.ts (see
// its comment) — declared explicitly rather than relying on that default.
export const dynamic = "force-dynamic";

const slugify = (s: string) => s.trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "staff";

/**
 * Public, token-authenticated — the axla.space/c/[token] page posts here.
 * Nothing about geofencing or the daily code is trusted from the client:
 * lat/lng come in raw, distance is recomputed server-side against the
 * owner's own shop_settings, same for the code match. A clock event is
 * NEVER rejected for being outside the geofence or for a wrong code — it's
 * flagged needs_approval for the owner to review instead, so a staff
 * member never gets stuck unable to clock in over a GPS hiccup.
 */
export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const token = String(formData.get("token") ?? "").trim();
  const type = formData.get("type");
  const latRaw = formData.get("lat");
  const lngRaw = formData.get("lng");
  const code = String(formData.get("code") ?? "").trim();
  const selfie = formData.get("selfie");

  if (!token) {
    return NextResponse.json({ error: "Invalid link." }, { status: 400 });
  }
  if (type !== "in" && type !== "out") {
    return NextResponse.json({ error: "Invalid clock action." }, { status: 400 });
  }
  const lat = Number(latRaw);
  const lng = Number(lngRaw);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ error: "Location is required — please enable location access and try again.", code: "LOCATION_REQUIRED" }, { status: 400 });
  }
  if (!(selfie instanceof File)) {
    return NextResponse.json({ error: "A selfie photo is required.", code: "SELFIE_REQUIRED" }, { status: 400 });
  }
  if (!ALLOWED_SELFIE_TYPES.includes(selfie.type)) {
    return NextResponse.json({ error: "Selfie must be a JPEG, PNG, or WebP photo." }, { status: 400 });
  }
  if (selfie.size > MAX_SELFIE_BYTES) {
    return NextResponse.json({ error: "Selfie must be under 5MB." }, { status: 400 });
  }

  const { data: staff, error: staffError } = await supabaseAdmin
    .from("payroll_staff")
    .select("id, name, owner_id")
    .eq("clock_token", token)
    .maybeSingle();
  if (staffError) {
    logError("payroll/timekeeping/clock: staff lookup failed", staffError);
    return NextResponse.json({ error: "Failed to record attendance." }, { status: 500 });
  }
  if (!staff) {
    return NextResponse.json({ error: "This clock-in link isn't valid. Ask your employer for a new one." }, { status: 404 });
  }

  const { data: lastLog, error: lastLogError } = await supabaseAdmin
    .from("timekeeping_logs")
    .select("created_at")
    .eq("staff_id", staff.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (lastLogError) {
    logError("payroll/timekeeping/clock: rate limit check failed", lastLogError);
    return NextResponse.json({ error: "Failed to record attendance." }, { status: 500 });
  }
  if (lastLog) {
    const elapsedMs = Date.now() - new Date(lastLog.created_at).getTime();
    if (elapsedMs < RATE_LIMIT_MS) {
      const waitMin = Math.ceil((RATE_LIMIT_MS - elapsedMs) / 60_000);
      return NextResponse.json(
        { error: `Please wait ${waitMin} more minute${waitMin === 1 ? "" : "s"} before clocking in/out again.`, code: "RATE_LIMITED" },
        { status: 429 },
      );
    }
  }

  let shop;
  try {
    shop = await getOrRotateShopSettings(staff.owner_id);
  } catch (err) {
    logError("payroll/timekeeping/clock: shop settings failed", err);
    return NextResponse.json({ error: "Failed to record attendance." }, { status: 500 });
  }

  const distance = shop.lat !== null && shop.lng !== null ? haversineMeters(lat, lng, shop.lat, shop.lng) : null;
  const isOutside = distance !== null && distance > shop.radius_meters;
  const dailyCodeMatch = Boolean(shop.daily_code) && code === shop.daily_code;
  const needsApproval = isOutside || !dailyCodeMatch;

  const today = new Date().toISOString().slice(0, 10);
  const timestamp = Date.now();
  const selfiePath = `${staff.owner_id}/${today}/${slugify(staff.name)}_${timestamp}_${lat.toFixed(5)}_${lng.toFixed(5)}.jpg`;
  const selfieBytes = new Uint8Array(await selfie.arrayBuffer());

  const { error: uploadError } = await supabaseAdmin.storage.from(BUCKET).upload(selfiePath, selfieBytes, {
    contentType: selfie.type,
    upsert: false,
  });
  if (uploadError) {
    logError("payroll/timekeeping/clock: selfie upload failed", uploadError);
    return NextResponse.json({ error: "Failed to upload selfie." }, { status: 500 });
  }

  const ip = getClientIp(req);
  const nowIso = new Date().toISOString();

  const { error: insertLogError } = await supabaseAdmin.from("timekeeping_logs").insert({
    owner_id: staff.owner_id,
    staff_id: staff.id,
    type,
    lat,
    lng,
    distance_meters: distance,
    is_outside: isOutside,
    daily_code_match: dailyCodeMatch,
    needs_approval: needsApproval,
    selfie_path: selfiePath,
    ip,
  });
  if (insertLogError) {
    logError("payroll/timekeeping/clock: log insert failed", insertLogError);
    return NextResponse.json({ error: "Failed to record attendance." }, { status: 500 });
  }

  // Keeps the existing (already-fixed) payroll compute pipeline working
  // unmodified — it reads payroll_attendance, not timekeeping_logs, so a
  // real AI Selfie clock-in shows up as a real day present the same way a
  // manual Timekeeping-tab entry does.
  const { data: existingAttendance } = await supabaseAdmin
    .from("payroll_attendance")
    .select("*")
    .eq("staff_id", staff.id)
    .eq("date", today)
    .maybeSingle();
  const patch = type === "in" ? { time_in: nowIso } : { time_out: nowIso };
  await supabaseAdmin
    .from("payroll_attendance")
    .upsert({ staff_id: staff.id, date: today, ...(existingAttendance ?? {}), ...patch, selfie_url: selfiePath }, { onConflict: "staff_id,date" });

  return NextResponse.json({ success: true, distance, needs_approval: needsApproval, timestamp: nowIso });
}
