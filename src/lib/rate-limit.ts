import "server-only";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";

export const CHAT_DAILY_LIMIT = 10;

export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}

/**
 * Atomically increments today's message count for an IP via a Postgres
 * function (so concurrent requests can't race past the limit) and reports
 * whether this request is still within CHAT_DAILY_LIMIT.
 *
 * Fails open (allowed: true) if Supabase isn't configured or the RPC errors,
 * so a rate-limiter outage never takes down the chat itself.
 */
export async function checkChatRateLimit(
  ip: string,
): Promise<{ allowed: boolean; count: number }> {
  if (!isSupabaseAdminConfigured) {
    return { allowed: true, count: 0 };
  }

  const { data, error } = await supabaseAdmin.rpc("increment_chat_rate_limit", {
    p_ip: ip,
  });

  if (error) {
    console.error("Rate limit check failed:", error);
    return { allowed: true, count: 0 };
  }

  const count = data as number;
  return { allowed: count <= CHAT_DAILY_LIMIT, count };
}
