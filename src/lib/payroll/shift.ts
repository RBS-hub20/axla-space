// Deliberately NOT "server-only" — pure date/shift math shared by the
// Timekeeping tab's summary cards, List View badges, and Timesheet View
// grid. Reads payroll_staff's structured shift_start/shift_end/work_days/
// grace_period_minutes (migration 028) rather than parsing the free-text
// `schedule` field used elsewhere for display.

export const WEEK_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

const DEFAULT_WORK_DAYS: WeekDay[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function parseWorkDays(workDays: string | null | undefined): WeekDay[] {
  if (!workDays) return DEFAULT_WORK_DAYS;
  const valid = workDays
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is WeekDay => (WEEK_DAYS as readonly string[]).includes(s));
  return valid.length > 0 ? valid : DEFAULT_WORK_DAYS;
}

/** `dateIso` is YYYY-MM-DD, parsed as UTC midnight to avoid local-timezone day-shift. `Date.UTC`'s getUTCDay is 0=Sun..6=Sat — rotated so Mon=0..Sun=6 to match WEEK_DAYS order. */
export function dayAbbrFor(dateIso: string): WeekDay {
  const d = new Date(`${dateIso}T00:00:00Z`);
  return WEEK_DAYS[(d.getUTCDay() + 6) % 7];
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + (m || 0);
}

function clockToMinutes(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes();
}

export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

export function formatClockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
}

/** Compact "9:05" / "18:10"-in-12h form (no AM/PM) for the Timesheet grid's "9:05-6:10" cells — formatClockTime's "9:05 AM" is too wide for a table cell repeated 7x per row. */
export function formatShortTime(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours() % 12 || 12;
  const m = String(d.getMinutes()).padStart(2, "0");
  return `${h}:${m}`;
}

export interface ShiftConfig {
  shiftStart: string;
  shiftEnd: string;
  gracePeriodMinutes: number;
  workDays: string | null;
}

export const DEFAULT_SHIFT: ShiftConfig = {
  shiftStart: "09:00",
  shiftEnd: "18:00",
  gracePeriodMinutes: 15,
  workDays: "Mon,Tue,Wed,Thu,Fri,Sat",
};

export type DayCellKind = "off" | "future" | "absent" | "leave" | "sick" | "present";

export interface DayCell {
  kind: DayCellKind;
  timeIn: string | null;
  timeOut: string | null;
  lateMinutes: number;
  overtimeMinutes: number;
  undertimeMinutes: number;
  workedMinutes: number | null;
}

const EMPTY: Omit<DayCell, "kind"> = { timeIn: null, timeOut: null, lateMinutes: 0, overtimeMinutes: 0, undertimeMinutes: 0, workedMinutes: null };

/**
 * Categorizes one staff/day combination for the Timesheet grid (and reused
 * by the summary cards for "today"). `record` is the payroll_attendance row
 * for that staff+date, if one exists. `todayIso` is passed in rather than
 * computed here so callers share one "now" across a whole grid render.
 */
export function computeDayCell(
  dateIso: string,
  record: { time_in: string | null; time_out: string | null; status?: string } | undefined,
  config: ShiftConfig,
  todayIso: string,
): DayCell {
  const workDays = parseWorkDays(config.workDays);
  const dayAbbr = dayAbbrFor(dateIso);
  if (!workDays.includes(dayAbbr)) return { kind: "off", ...EMPTY };

  if (record?.status === "leave") return { kind: "leave", ...EMPTY };
  if (record?.status === "sick") return { kind: "sick", ...EMPTY };
  if (record?.status === "absent") return { kind: "absent", ...EMPTY };

  if (!record?.time_in) {
    if (dateIso > todayIso) return { kind: "future", ...EMPTY };
    return { kind: "absent", ...EMPTY };
  }

  const shiftStartMin = timeToMinutes(config.shiftStart);
  const shiftEndMin = timeToMinutes(config.shiftEnd);
  const inMin = clockToMinutes(record.time_in);
  const lateMinutes = Math.max(0, inMin - (shiftStartMin + config.gracePeriodMinutes));

  let overtimeMinutes = 0;
  let undertimeMinutes = 0;
  let workedMinutes: number | null = null;
  if (record.time_out) {
    const outMin = clockToMinutes(record.time_out);
    workedMinutes = Math.max(0, outMin - inMin);
    overtimeMinutes = Math.max(0, outMin - shiftEndMin);
    undertimeMinutes = Math.max(0, shiftEndMin - outMin);
  }

  return { kind: "present", timeIn: record.time_in, timeOut: record.time_out, lateMinutes, overtimeMinutes, undertimeMinutes, workedMinutes };
}

/** Monday-Sunday dates (YYYY-MM-DD) for the week containing `dateIso`. */
export function currentWeekDates(dateIso: string): string[] {
  const d = new Date(`${dateIso}T00:00:00Z`);
  const mondayOffset = (d.getUTCDay() + 6) % 7; // days since this week's Monday
  const monday = new Date(d);
  monday.setUTCDate(d.getUTCDate() - mondayOffset);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + i);
    return day.toISOString().slice(0, 10);
  });
}
