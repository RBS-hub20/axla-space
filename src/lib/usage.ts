import "server-only";
import { supabaseAdmin, isSupabaseAdminConfigured } from "@/lib/supabase/admin";
import { logError } from "@/lib/log-error";

export type UsageType = "filing" | "scan" | "ai_chat";

export const FREE_LIMITS: Record<UsageType, number> = { filing: 1, scan: 5, ai_chat: 5 };

export const LIMIT_MESSAGES: Record<UsageType, string> = {
  scan: "Na-scan mo na ang 5/5 free receipts mo this month. Sa Pro, UNLIMITED!",
  filing: "Nagamit mo na ang 1 free filing mo this quarter. Mag-Pro ka para unlimited filing!",
  ai_chat: "Naubos mo na 5 free AI questions mo today. Pro = unlimited TaxLaya chat 24/7!",
};

export interface UsageCheckResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  isUnlimited: boolean;
}

interface UsageBucket {
  used: number;
  limit: number | null; // null = unlimited
  remaining: number | null;
}

export interface UsageSummary {
  plan: "free" | "pro" | "business";
  isUnlimited: boolean;
  filings: UsageBucket;
  scans: UsageBucket;
  aiChats: UsageBucket;
}

function unlimitedBucket(): UsageBucket {
  return { used: 0, limit: null, remaining: null };
}

function bucket(used: number, limit: number): UsageBucket {
  return { used, limit, remaining: Math.max(0, limit - used) };
}

/** Plan-gated feature limits that aren't per-period usage counters. */
export const PLAN_LIMITS = {
  maxBusinesses: { free: 1, pro: 1, business: 5 },
  /** Total GCash transactions a free-plan user can have stored, across all uploads — Pro/Business are unlimited. */
  maxFreeTransactions: 50,
};

/** Public wrapper so other features (business count, team invites) can gate on plan without duplicating the subscriptions lookup. */
export async function getUserPlan(email: string): Promise<"free" | "pro" | "business"> {
  const paid = await getActivePaidPlan(email);
  return paid ?? "free";
}

/** A subscription only bypasses free-tier limits while it's actually active — a canceled/past_due pro plan falls back to free limits. */
async function getActivePaidPlan(email: string): Promise<"pro" | "business" | null> {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("plan, status")
    .eq("email", email.toLowerCase())
    .maybeSingle();

  if (error) {
    logError("usage: subscription lookup failed", error);
    return null;
  }
  if (data?.status === "active" && (data.plan === "pro" || data.plan === "business")) {
    return data.plan;
  }
  return null;
}

/**
 * Checks the free-tier limit for one usage type and, if under it,
 * atomically increments it (via the check_and_increment_usage RPC — see
 * migrations/007_usage_metering.sql). Pro/Business plans bypass the DB
 * round-trip entirely and are always allowed.
 */
export async function checkAndIncrementUsage(userId: string, email: string, type: UsageType): Promise<UsageCheckResult> {
  if (!isSupabaseAdminConfigured) {
    return { allowed: true, remaining: Infinity, limit: Infinity, isUnlimited: true };
  }

  const paidPlan = await getActivePaidPlan(email);
  if (paidPlan) {
    return { allowed: true, remaining: Infinity, limit: Infinity, isUnlimited: true };
  }

  const { data, error } = await supabaseAdmin.rpc("check_and_increment_usage", { p_user_id: userId, p_type: type });
  if (error) {
    logError("checkAndIncrementUsage: RPC failed", error);
    // Fail open — a metering outage should never block a free user from using the product.
    return { allowed: true, remaining: FREE_LIMITS[type], limit: FREE_LIMITS[type], isUnlimited: false };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { allowed: row.allowed, remaining: row.remaining, limit: row.limit, isUnlimited: false };
}

/** Read-only usage snapshot for the settings page / header badge — never increments anything. */
export async function getUsageSummary(userId: string, email: string): Promise<UsageSummary> {
  if (!isSupabaseAdminConfigured) {
    return { plan: "free", isUnlimited: false, filings: bucket(0, FREE_LIMITS.filing), scans: bucket(0, FREE_LIMITS.scan), aiChats: bucket(0, FREE_LIMITS.ai_chat) };
  }

  const paidPlan = await getActivePaidPlan(email);
  if (paidPlan) {
    return { plan: paidPlan, isUnlimited: true, filings: unlimitedBucket(), scans: unlimitedBucket(), aiChats: unlimitedBucket() };
  }

  const { data, error } = await supabaseAdmin
    .from("usage_counters")
    .select("month_year, quarter_key, day_key, filings_used, scans_used, ai_chats_used")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) logError("getUsageSummary: query failed", error);

  const now = new Date();
  const monthYear = now.toISOString().slice(0, 7);
  const quarterKey = `${now.getFullYear()}-Q${Math.floor(now.getMonth() / 3) + 1}`;
  const dayKey = now.toISOString().slice(0, 10);

  // Mirrors the RPC's own lazy-reset logic, read-only: a stale counter (from
  // a prior month/quarter/day) displays as 0 rather than its stored value,
  // without writing anything back — a GET must never have side effects.
  const filingsUsed = data && data.quarter_key === quarterKey ? data.filings_used : 0;
  const scansUsed = data && data.month_year === monthYear ? data.scans_used : 0;
  const aiChatsUsed = data && data.day_key === dayKey ? data.ai_chats_used : 0;

  return {
    plan: "free",
    isUnlimited: false,
    filings: bucket(filingsUsed, FREE_LIMITS.filing),
    scans: bucket(scansUsed, FREE_LIMITS.scan),
    aiChats: bucket(aiChatsUsed, FREE_LIMITS.ai_chat),
  };
}
