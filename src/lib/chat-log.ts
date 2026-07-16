import "server-only";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";

const MAX_LOGGED_MESSAGE_LENGTH = 2000;

/**
 * Best-effort log of a user's message for the admin dashboard's chat
 * analytics (message volume, top questions, most-asked forms, recent
 * activity). Never throws — a logging failure must never break the chat
 * itself, so errors are swallowed after being reported to the console.
 */
export async function logUserMessage(ip: string, message: string): Promise<void> {
  if (!isSupabaseAdminConfigured) return;

  const trimmed = message.trim().slice(0, MAX_LOGGED_MESSAGE_LENGTH);
  if (!trimmed) return;

  const { error } = await supabaseAdmin.from("chat_messages").insert({ ip, message: trimmed });

  if (error) {
    console.error("Failed to log chat message:", error);
  }
}
