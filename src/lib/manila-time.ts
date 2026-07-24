/**
 * Manila (Asia/Manila, UTC+8, no DST) time helpers — shared by the server
 * (Jarvis voice/text answers) and the client (JarvisHUD's live clock and
 * greeting badge), so both always agree on what time/greeting it "is."
 * Works in both environments: Intl.DateTimeFormat with an explicit
 * timeZone doesn't depend on the runtime's local timezone.
 */

function manilaHour(date: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "numeric", hourCycle: "h23" });
  return Number(formatter.format(date));
}

/** "HH:MM:SS" in 24h Manila time, for display alongside a "PHT" suffix. */
export function formatManilaTime(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/** "YYYY-MM-DD" in Manila time — the calendar date deadlines are compared against. */
export function formatManilaDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export type ShiftLabel = "🌅 MORNING SHIFT" | "☀️ DAY SHIFT" | "🌆 EVENING SHIFT" | "🌙 LATE NIGHT SHIFT";

export interface ManilaGreeting {
  greeting: string; // "Good morning" / "Good afternoon" / "Good evening" / "Working late"
  shiftLabel: ShiftLabel;
}

/**
 * Good morning (5-11), Good afternoon (12-17), Good evening (18-23),
 * Working late (0-4) — the last one because "Good evening, Boss" at 2am
 * reads wrong; a Tony-Stark-Jarvis would clock the late hour instead.
 */
export function getManilaGreeting(date: Date = new Date()): ManilaGreeting {
  const hour = manilaHour(date);
  if (hour < 5) return { greeting: "Working late", shiftLabel: "🌙 LATE NIGHT SHIFT" };
  if (hour < 12) return { greeting: "Good morning", shiftLabel: "🌅 MORNING SHIFT" };
  if (hour < 18) return { greeting: "Good afternoon", shiftLabel: "☀️ DAY SHIFT" };
  return { greeting: "Good evening", shiftLabel: "🌆 EVENING SHIFT" };
}
