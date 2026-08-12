// Deliberately NOT "server-only" — computed client-side from attendance
// rows already fetched for the Timekeeping tab (no extra API call).

export interface AttendanceStats {
  daysPresent: number;
  /** null when `schedule` has no parseable start time — there's nothing real to compare clock-ins against, so we show a day count instead of a fabricated on-time percentage. */
  lateCount: number | null;
  onTimePct: number | null;
}

const GRACE_MINUTES = 15;

/** Pulls the first "9AM" / "9:00 AM" / "09:00" style time out of a free-text schedule string like "Mon-Sat 9AM-6PM". Returns minutes-since-midnight, or null if nothing matched. */
function parseScheduleStartMinutes(schedule: string | null): number | null {
  if (!schedule) return null;
  const ampm = schedule.match(/(\d{1,2})(?::(\d{2}))?\s*(AM|PM)/i);
  if (ampm) {
    let hour = parseInt(ampm[1], 10) % 12;
    if (/pm/i.test(ampm[3])) hour += 12;
    const min = ampm[2] ? parseInt(ampm[2], 10) : 0;
    return hour * 60 + min;
  }
  const military = schedule.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  if (military) {
    return parseInt(military[1], 10) * 60 + parseInt(military[2], 10);
  }
  return null;
}

/** `records` should already be scoped to one staff member's clock-ins for the window being summarized (e.g. this month). */
export function computeAttendanceStats(records: { time_in: string | null }[], schedule: string | null): AttendanceStats {
  const present = records.filter((r) => r.time_in);
  const daysPresent = present.length;

  const startMinutes = parseScheduleStartMinutes(schedule);
  if (startMinutes === null || daysPresent === 0) {
    return { daysPresent, lateCount: null, onTimePct: null };
  }

  let lateCount = 0;
  for (const r of present) {
    const d = new Date(r.time_in as string);
    const clockInMinutes = d.getHours() * 60 + d.getMinutes();
    if (clockInMinutes > startMinutes + GRACE_MINUTES) lateCount += 1;
  }

  return { daysPresent, lateCount, onTimePct: Math.round(((daysPresent - lateCount) / daysPresent) * 100) };
}
