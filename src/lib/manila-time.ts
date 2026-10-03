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

/** Minutes since Manila midnight (0-1439) — the input every late/overtime/undertime minute comparison in lib/payroll/shift.ts is built on. Never use `date.getHours()`/`getMinutes()` for this: those read the *runtime's* local timezone, which is UTC on most Node hosts (Vercel included) — a 9:05 AM Manila clock-in would silently become "1:05 AM" server-side and corrupt every lateness/overtime figure that feeds into actual payroll. */
export function manilaMinutesSinceMidnight(date: Date): number {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "numeric", minute: "numeric", hourCycle: "h23" });
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
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

/** "9:05 AM" in 12h Manila time, no seconds — compact enough for a repeated table cell (the Timekeeping tab's Timesheet grid, Manual Time In/Out). */
export function formatManilaShortTime(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Manila", hour: "numeric", minute: "2-digit" }).format(date);
}

/** "YYYY-MM-DD" in Manila time — the calendar date deadlines are compared against. */
export function formatManilaDate(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export type ShiftLabel = "🌅 MORNING SHIFT" | "☀️ DAY SHIFT" | "🌆 EVENING SHIFT" | "🌙 LATE NIGHT SHIFT";

export interface ManilaGreeting {
  greeting: string; // "Good morning" / "Good afternoon" / "Good evening" / "Working late"
  shiftLabel: ShiftLabel;
  /** A short personality aside for the given hour — used sparingly (wake-up/greeting intents), not glued onto every response. */
  vibe: string;
}

/**
 * Good morning (5-11), Good afternoon (12-17), Good evening (18-23),
 * Working late (0-4) — the last one because "Good evening, Sir" at 2am
 * reads wrong; a Tony-Stark-Jarvis would clock the late hour instead.
 * `vibe` deliberately stays address-term-free — it's appended alongside a
 * greeting that already says "Sir" once, and the 1-2-per-response cap
 * applies across the whole message, not per clause.
 */
export function getManilaGreeting(date: Date = new Date()): ManilaGreeting {
  const hour = manilaHour(date);
  if (hour < 5) return { greeting: "Working late", shiftLabel: "🌙 LATE NIGHT SHIFT", vibe: "Graveyard shift — I like it." };
  if (hour < 12) return { greeting: "Good morning", shiftLabel: "🌅 MORNING SHIFT", vibe: "Early grind? Love the hustle." };
  if (hour < 18) return { greeting: "Good afternoon", shiftLabel: "☀️ DAY SHIFT", vibe: "Afternoon check-in." };
  return { greeting: "Good evening", shiftLabel: "🌆 EVENING SHIFT", vibe: "Evening operations." };
}
