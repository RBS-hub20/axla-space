import type { ChatMessageRow } from "@/lib/supabase/admin";

const KNOWN_BIR_FORMS = ["2551Q", "1701Q", "0619E", "1601C", "2550Q", "0605", "1701"];

/**
 * Finds every known BIR form code mentioned in a message, longest-code-first
 * so "1701Q" isn't double-counted as a "1701" match too.
 */
function formsMentionedIn(message: string): string[] {
  const upper = message.toUpperCase();
  const sortedForms = [...KNOWN_BIR_FORMS].sort((a, b) => b.length - a.length);
  const found: string[] = [];
  let remaining = upper;

  for (const form of sortedForms) {
    if (remaining.includes(form)) {
      found.push(form);
      remaining = remaining.replaceAll(form, "");
    }
  }

  return found;
}

export interface FormCount {
  form: string;
  count: number;
}

/** Tally of every known BIR form code mentioned across all messages, most-asked first. */
export function formBreakdown(messages: ChatMessageRow[]): FormCount[] {
  const counts = new Map<string, number>();

  for (const { message } of messages) {
    for (const form of formsMentionedIn(message)) {
      counts.set(form, (counts.get(form) ?? 0) + 1);
    }
  }

  return [...counts.entries()]
    .map(([form, count]) => ({ form, count }))
    .sort((a, b) => b.count - a.count);
}

export function mostAskedForm(messages: ChatMessageRow[]): string {
  return formBreakdown(messages)[0]?.form ?? "N/A";
}

export interface TopQuestion {
  question: string;
  count: number;
  lastAsked: string;
}

/** Groups messages by normalized text (trimmed, collapsed whitespace, lowercased). */
export function topQuestions(messages: ChatMessageRow[], limit = 10): TopQuestion[] {
  const groups = new Map<string, { question: string; count: number; lastAsked: string }>();

  for (const { message, created_at } of messages) {
    const key = message.trim().replace(/\s+/g, " ").toLowerCase();
    if (!key) continue;

    const existing = groups.get(key);
    if (existing) {
      existing.count += 1;
      if (created_at > existing.lastAsked) existing.lastAsked = created_at;
    } else {
      groups.set(key, { question: message.trim(), count: 1, lastAsked: created_at });
    }
  }

  return [...groups.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

export interface RecentChat {
  ip: string;
  firstQuestion: string;
  timestamp: string;
}

/**
 * Approximates "conversations" as one per (IP, calendar day) since messages
 * aren't linked to a session id — the earliest message in each group stands
 * in for that conversation's opening question.
 */
export function recentChats(messages: ChatMessageRow[], limit = 5): RecentChat[] {
  const groups = new Map<string, { ip: string; firstQuestion: string; timestamp: string }>();

  for (const { ip, message, created_at } of messages) {
    const day = new Date(created_at).toDateString();
    const key = `${ip}__${day}`;
    const existing = groups.get(key);

    if (!existing || created_at < existing.timestamp) {
      groups.set(key, { ip, firstQuestion: message.trim(), timestamp: created_at });
    }
  }

  return [...groups.values()]
    .sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))
    .slice(0, limit);
}

/** Counts messages in each hour-of-day bucket (0-23, local time) to surface peak usage. */
export function messagesByHour(messages: ChatMessageRow[]): { hour: number; count: number }[] {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));

  for (const { created_at } of messages) {
    const hour = new Date(created_at).getHours();
    buckets[hour].count += 1;
  }

  return buckets;
}

export type Sentiment = "positive" | "neutral" | "frustrated";

const FRUSTRATED_MARKERS = ["hate", "galit", "penalty", "late", "putang"];

const POSITIVE_MARKERS = ["salamat", "thanks", "ok na", "gets"];

/**
 * Lightweight keyword heuristic, not a model call — cheap enough to run over
 * every logged message. Frustration markers win ties since a frustrated user
 * is the more actionable signal for a support-style feed.
 */
export function classifySentiment(message: string): Sentiment {
  const lower = message.toLowerCase();

  const isFrustrated = FRUSTRATED_MARKERS.some((marker) => lower.includes(marker));
  if (isFrustrated) return "frustrated";

  const isPositive = POSITIVE_MARKERS.some((marker) => lower.includes(marker));
  if (isPositive) return "positive";

  return "neutral";
}

/**
 * Distinct chat IPs whose most recent message is 7+ days old — people who
 * tried TaxLaya before but haven't been back. Not tied to signups since
 * there's no login linking a chat IP to a waitlist email.
 */
export function churnRiskCount(messages: ChatMessageRow[], days = 7): number {
  const lastSeenByIp = new Map<string, string>();

  for (const { ip, created_at } of messages) {
    const existing = lastSeenByIp.get(ip);
    if (!existing || created_at > existing) lastSeenByIp.set(ip, created_at);
  }

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);

  let atRisk = 0;
  for (const lastSeen of lastSeenByIp.values()) {
    if (new Date(lastSeen) < cutoff) atRisk += 1;
  }

  return atRisk;
}

/** Masks the last two segments of an IP for display: 123.45.67.89 -> 123.45.XX.XX */
export function blurIp(ip: string): string {
  if (ip.includes(".")) {
    const parts = ip.split(".");
    if (parts.length === 4) {
      return `${parts[0]}.${parts[1]}.XX.XX`;
    }
  }

  if (ip.includes(":")) {
    const parts = ip.split(":");
    if (parts.length >= 3) {
      return `${parts.slice(0, -2).join(":")}:XXXX:XXXX`;
    }
  }

  if (ip.length > 4) {
    return `${ip.slice(0, -4)}XXXX`;
  }

  return ip;
}
