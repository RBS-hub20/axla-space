import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { generateDailyCode, todayIso } from "@/lib/payroll/geo";

export interface ShopSettings {
  owner_id: string;
  shop_name: string;
  lat: number | null;
  lng: number | null;
  radius_meters: number;
  daily_code: string | null;
  daily_code_date: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Single source of truth for "does today's shop code need rotating" —
 * called from both the owner-facing settings GET and the public clock POST,
 * so the code advances lazily on whichever request touches it first each
 * day rather than needing a cron job neither of those routes can rely on
 * existing.
 */
export async function getOrRotateShopSettings(ownerId: string): Promise<ShopSettings> {
  const { data: existing } = await supabaseAdmin.from("shop_settings").select("*").eq("owner_id", ownerId).maybeSingle();
  const today = todayIso();

  if (!existing) {
    const { data: created, error } = await supabaseAdmin
      .from("shop_settings")
      .insert({ owner_id: ownerId, daily_code: generateDailyCode(), daily_code_date: today })
      .select()
      .single();
    if (error || !created) throw error ?? new Error("Failed to create shop settings.");
    return created as ShopSettings;
  }

  if (existing.daily_code_date !== today) {
    const { data: updated, error } = await supabaseAdmin
      .from("shop_settings")
      .update({ daily_code: generateDailyCode(), daily_code_date: today })
      .eq("owner_id", ownerId)
      .select()
      .single();
    if (error || !updated) throw error ?? new Error("Failed to rotate shop code.");
    return updated as ShopSettings;
  }

  return existing as ShopSettings;
}
