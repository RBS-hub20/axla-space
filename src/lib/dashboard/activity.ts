import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

export interface ActivityRow {
  id: string;
  user_id: string;
  action: string;
  description: string;
  created_at: string;
}

/** Best-effort activity log — a failed insert here shouldn't break the action it's logging. */
export async function logActivity(userId: string, action: string, description: string): Promise<void> {
  const { error } = await supabaseAdmin.from("activities").insert({ user_id: userId, action, description });
  if (error) {
    logError("logActivity: insert failed", error);
  }
}

export async function getRecentActivities(userId: string, limit = 5): Promise<ActivityRow[]> {
  const { data, error } = await supabaseAdmin
    .from("activities")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logError("getRecentActivities: query failed", error);
    return [];
  }

  return (data as ActivityRow[]) ?? [];
}
