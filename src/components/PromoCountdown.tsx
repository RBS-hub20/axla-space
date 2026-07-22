"use client";

import { useEffect, useState } from "react";
import { PROMO } from "@/lib/promo";

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function getTimeLeft(): TimeLeft | null {
  const diff = PROMO.endDate.getTime() - Date.now();
  if (diff <= 0) return null;
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff % 86_400_000) / 3_600_000),
    minutes: Math.floor((diff % 3_600_000) / 60_000),
    seconds: Math.floor((diff % 60_000) / 1000),
  };
}

/**
 * Live-ticking countdown to PROMO.endDate (a fixed date, not a rolling
 * window, so it genuinely expires). Deliberately NOT `sticky` on its own —
 * Navbar is already `sticky top-0`, and two independently-sticky siblings
 * at the same offset overlap instead of stacking. Wrap this together with
 * <Navbar /> in a single `sticky top-0` container at each call site instead.
 */
export function PromoCountdown() {
  // null on the very first render (SSR) avoids a hydration mismatch between
  // server time and client time; the real countdown fills in a tick later.
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null | undefined>(undefined);

  useEffect(() => {
    setTimeLeft(getTimeLeft());
    const interval = setInterval(() => setTimeLeft(getTimeLeft()), 1000);
    return () => clearInterval(interval);
  }, []);

  if (timeLeft === undefined) {
    return <div className="h-10 bg-[#22c55e] sm:h-9" aria-hidden />;
  }

  const expired = timeLeft === null;

  return (
    <div className="bg-[#22c55e] px-3 py-2 text-center text-[#001A29] shadow-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-xs font-bold sm:text-sm">
        {expired ? (
          <span>Promo ended — PRO ₱499/mo</span>
        ) : (
          <>
            <span className="animate-pulse">🔥 LAUNCH PROMO — PRO 50% OFF</span>
            <span className="hidden sm:inline">·</span>
            <span className="tabular-nums">
              {timeLeft.days}d {String(timeLeft.hours).padStart(2, "0")}h {String(timeLeft.minutes).padStart(2, "0")}m{" "}
              {String(timeLeft.seconds).padStart(2, "0")}s LEFT
            </span>
            <span className="hidden sm:inline">·</span>
            <span>
              ₱{PROMO.proPricePesos}/mo <span className="font-normal line-through opacity-70">reg ₱499</span>
            </span>
          </>
        )}
      </div>
    </div>
  );
}
