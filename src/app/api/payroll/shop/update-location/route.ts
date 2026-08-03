import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import { getEffectiveOwner } from "@/lib/team";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { getOrRotateShopSettings } from "@/lib/payroll/shop-settings";
import { logError } from "@/lib/log-error";

interface UpdateLocationBody {
  lat?: unknown;
  lng?: unknown;
  radius?: unknown;
  shopName?: unknown;
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const owner = await getEffectiveOwner(user);
  if (!owner.permissions.canEditPayroll) {
    return NextResponse.json({ error: "You don't have permission to edit payroll." }, { status: 403 });
  }
  if (!isSupabaseAdminConfigured) {
    return NextResponse.json({ error: "Supabase isn't configured yet." }, { status: 503 });
  }

  let body: UpdateLocationBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const lat = Number(body.lat);
  const lng = Number(body.lng);
  const radius = Number(body.radius);
  if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
    return NextResponse.json({ error: "Invalid latitude." }, { status: 400 });
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    return NextResponse.json({ error: "Invalid longitude." }, { status: 400 });
  }
  if (!Number.isFinite(radius) || radius < 20 || radius > 2000) {
    return NextResponse.json({ error: "Geofence radius must be between 20m and 2000m." }, { status: 400 });
  }
  const shopName = typeof body.shopName === "string" && body.shopName.trim() ? body.shopName.trim().slice(0, 120) : undefined;

  // Ensures the row (and today's daily_code) exists before we patch it —
  // same lazy-create path the GET route uses, so update-location works even
  // as the very first call a brand-new owner makes.
  await getOrRotateShopSettings(owner.ownerId);

  const { data, error } = await supabaseAdmin
    .from("shop_settings")
    .update({
      lat,
      lng,
      radius_meters: Math.round(radius),
      ...(shopName ? { shop_name: shopName } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("owner_id", owner.ownerId)
    .select()
    .single();

  if (error || !data) {
    logError("payroll/shop/update-location POST: update failed", error);
    return NextResponse.json({ error: "Failed to update shop location." }, { status: 500 });
  }

  return NextResponse.json({ settings: data });
}
