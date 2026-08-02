"use client";

import { useEffect, useState } from "react";
import { PAYROLL_PROMO } from "@/lib/payroll/promo";

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function getTimeLeft(): TimeLeft | null {
  const diff = PAYROLL_PROMO.endDate.getTime() - Date.now();
  if (diff <= 0) return null;
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1000),
  };
}

/** Live-ticking countdown to PAYROLL_PROMO.endDate — same pattern as src/components/PromoCountdown.tsx (TaxLaya's LAUNCH50), separate component since the copy/pricing differ. */
export function PayrollPromoCountdown() {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null | undefined>(undefined);

  useEffect(() => {
    setTimeLeft(getTimeLeft());
    const interval = setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (timeLeft === undefined) {
    return <div className="h-11 bg-[#00FF88] sm:h-10" aria-hidden />;
  }

  const expired = timeLeft === null;

  return (
    <div className="bg-[#00FF88] px-3 py-2.5 text-center text-black shadow-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-xs font-bold sm:text-sm">
        {expired ? (
          <span>Launch promo ended — regular pricing na</span>
        ) : (
          <>
            <span className="animate-pulse">🎉 Launch Promo — 50% OFF for 2 Months!</span>
            <span className="hidden sm:inline">·</span>
            <span className="tabular-nums">
              {timeLeft.days}d {String(timeLeft.hours).padStart(2, "0")}h {String(timeLeft.minutes).padStart(2, "0")}m{" "}
              {String(timeLeft.seconds).padStart(2, "0")}s LEFT
            </span>
            <span className="hidden sm:inline">·</span>
            <span>Until Aug 31, 2026 only!</span>
          </>
        )}
      </div>
    </div>
  );
}
