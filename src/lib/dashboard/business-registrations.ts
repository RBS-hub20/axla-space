import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

export type RegistrationType = "OPEN" | "CLOSE" | "SPA" | "DTI" | "SEC" | "MAYORS";

/** Best-effort — a failed history log should never block the ZIP the user is waiting on. */
export async function saveBusinessRegistration(userId: string, type: RegistrationType, data: Record<string, unknown>): Promise<void> {
  const { error } = await supabaseAdmin.from("business_registrations").insert({ user_id: userId, type, data, status: "generated" });
  if (error) logError(`saveBusinessRegistration: insert failed (${type})`, error);
}
