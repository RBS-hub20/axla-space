import { getQuarterDeadline } from "@/lib/tax-calculator";
import { getCurrentQuarter } from "@/lib/dashboard/quarter";
import { formatManilaDate } from "@/lib/manila-time";

export type DeadlineStatus = "OVERDUE" | "WARNING" | "OK";

export interface BirDeadline {
  name: string;
  date: string; // ISO date, YYYY-MM-DD
  daysLeft: number; // negative once overdue
  status: DeadlineStatus;
}

function statusFor(daysLeft: number): DeadlineStatus {
  if (daysLeft < 0) return "OVERDUE";
  if (daysLeft <= 7) return "WARNING";
  return "OK";
}

/** Days between two YYYY-MM-DD dates, treated as plain calendar dates (no time-of-day component). */
function daysBetween(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO}T00:00:00Z`);
  const to = new Date(`${toISO}T00:00:00Z`);
  return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

interface LabeledCandidate {
  date: Date;
  label: string;
}

/**
 * The single most relevant occurrence of a recurring deadline "as of
 * today": whichever candidate (drawn from the surrounding few periods) is
 * closest to now, allowing a small grace window into the past so a
 * just-missed deadline still shows as OVERDUE instead of silently jumping
 * to the next one. Returns the LABEL of whichever candidate actually won —
 * "current quarter" and "the quarter whose deadline is nearest" are not
 * the same thing (e.g. on July 25, the nearest 2551Q deadline is Q2's, due
 * that day, even though today falls in Q3) — labeling by current quarter
 * instead of the winning candidate's own quarter would show a date that
 * doesn't match its own name.
 */
function closestCandidate(candidates: LabeledCandidate[], todayISO: string): { date: string; daysLeft: number; label: string } {
  let best: { date: string; daysLeft: number; label: string } | null = null;
  for (const c of candidates) {
    const iso = toISODate(c.date);
    const daysLeft = daysBetween(todayISO, iso);
    if (!best || Math.abs(daysLeft) < Math.abs(best.daysLeft)) {
      best = { date: iso, daysLeft, label: c.label };
    }
  }
  return best!;
}

/** 1601C — monthly withholding, due the 10th of the following month. Not in tax-calculator.ts (quarterly-only), computed directly here. */
function withholding1601CDeadline(forMonth: number, forYear: number): Date {
  const dueMonth = forMonth === 11 ? 0 : forMonth + 1;
  const dueYear = forMonth === 11 ? forYear + 1 : forYear;
  return new Date(Date.UTC(dueYear, dueMonth, 10));
}

/**
 * Real, dynamically-computed BIR deadlines as of Manila "today" — never
 * hardcoded example dates, since those go stale the moment the real date
 * moves past them. Covers the forms this app's actual users (8%/3%
 * percentage-tax freelancers) file: 2551Q and 1701Q (via the existing
 * getQuarterDeadline single source of truth), 1601C, and the Annual 1701.
 * Deliberately does NOT include 2550Q/2550M (VAT) — this app is built for
 * non-VAT percentage-tax filers, and showing VAT deadlines here would be
 * actively wrong guidance for that audience.
 */
export function getBirDeadlines(now: Date = new Date()): BirDeadline[] {
  const todayISO = formatManilaDate(now);
  const { quarter, year } = getCurrentQuarter(now);

  const quarters: Array<{ q: 1 | 2 | 3 | 4; y: number }> = [
    quarter === 1 ? { q: 4, y: year - 1 } : { q: (quarter - 1) as 1 | 2 | 3, y: year },
    { q: quarter, y: year },
    quarter === 4 ? { q: 1, y: year + 1 } : { q: (quarter + 1) as 1 | 2 | 3 | 4, y: year },
  ];

  const percentageTax = closestCandidate(
    quarters.map(({ q, y }) => ({ date: getQuarterDeadline("2551Q", q, y), label: `Q${q} ${y}` })),
    todayISO,
  );

  // 1701Q has no real Q4 filing (rolls into the Annual 1701) — exclude Q4 candidates.
  const incomeTaxQuarterly = closestCandidate(
    quarters.filter(({ q }) => q !== 4).map(({ q, y }) => ({ date: getQuarterDeadline("1701Q", q, y), label: `Q${q} ${y}` })),
    todayISO,
  );

  const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const nowMonth = Number(todayISO.slice(5, 7)) - 1;
  const nowYear = Number(todayISO.slice(0, 4));
  const monthCandidates = [-1, 0, 1].map((offset) => {
    let m = nowMonth + offset;
    let y = nowYear;
    if (m < 0) {
      m += 12;
      y -= 1;
    } else if (m > 11) {
      m -= 12;
      y += 1;
    }
    return { date: withholding1601CDeadline(m, y), label: MONTH_NAMES[m] };
  });
  const withholding = closestCandidate(monthCandidates, todayISO);

  // Annual 1701 — always Apr 15; roll to next year once this year's has passed.
  const thisYearApr15 = toISODate(new Date(Date.UTC(nowYear, 3, 15)));
  const annualDate = daysBetween(todayISO, thisYearApr15) < -30 ? toISODate(new Date(Date.UTC(nowYear + 1, 3, 15))) : thisYearApr15;
  const annual = { date: annualDate, daysLeft: daysBetween(todayISO, annualDate) };

  return [
    { name: `2551Q Percentage Tax (${percentageTax.label})`, date: percentageTax.date, daysLeft: percentageTax.daysLeft, status: statusFor(percentageTax.daysLeft) },
    { name: `1701Q Income Tax (${incomeTaxQuarterly.label})`, date: incomeTaxQuarterly.date, daysLeft: incomeTaxQuarterly.daysLeft, status: statusFor(incomeTaxQuarterly.daysLeft) },
    { name: `1601C Withholding (${withholding.label})`, date: withholding.date, daysLeft: withholding.daysLeft, status: statusFor(withholding.daysLeft) },
    { name: "1701 Annual ITR", date: annual.date, daysLeft: annual.daysLeft, status: statusFor(annual.daysLeft) },
  ];
}
