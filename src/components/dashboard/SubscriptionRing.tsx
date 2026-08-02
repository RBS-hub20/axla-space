"use client";

import { useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { PROMO } from "@/lib/promo";

export interface SubscriptionRingProps {
  /** Days remaining until the current billing period ends. Omit (along with expiryDate) to render the labeled sample state. */
  daysLeft?: number;
  expiryDate?: string;
  plan?: "pro" | "business";
  /** Lifetime owner override — takes priority over the sample state, shows ∞ instead of a day count. */
  isLifetime?: boolean;
}

const SAMPLE_DAYS_LEFT = 26;

function ringColor(daysLeft: number): string {
  if (daysLeft <= 2) return "#EF4444";
  if (daysLeft <= 7) return "#FACC15";
  return "#00FF88";
}

export function SubscriptionRing({ daysLeft, expiryDate, plan, isLifetime }: SubscriptionRingProps) {
  const [open, setOpen] = useState(false);
  const isSample = !isLifetime && daysLeft === undefined;
  // Nullish coalescing directly on the prop (not the isSample boolean) —
  // TypeScript can't narrow daysLeft's type through a separately-computed
  // boolean, only through a direct check like this.
  const effectiveDays = daysLeft ?? SAMPLE_DAYS_LEFT;
  const expired = !isLifetime && effectiveDays <= 0;
  const clamped = Math.max(0, Math.min(30, effectiveDays));

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const progress = isLifetime ? 1 : expired ? 0 : clamped / 30;
  const offset = circumference - progress * circumference;
  const color = isLifetime ? "#00FF88" : expired ? "#EF4444" : ringColor(effectiveDays);
  const pulse = !isLifetime && !isSample && (expired || effectiveDays <= 7);

  const expiryLabel = expiryDate
    ? new Date(expiryDate).toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" })
    : "Not set";
  const daysUsed = 30 - clamped;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex h-28 w-28 shrink-0 items-center justify-center sm:h-32 sm:w-32"
        aria-label="Subscription status"
      >
        <svg viewBox="0 0 100 100" className={`h-full w-full -rotate-90 ${pulse ? "animate-pulse" : ""}`}>
          <circle cx="50" cy="50" r={radius} fill="none" stroke="#1E293B" strokeWidth="8" />
          <circle
            cx="50"
            cy="50"
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
          />
        </svg>
        <div className="absolute flex flex-col items-center">
          <span className="text-2xl font-extrabold text-white">{isLifetime ? "∞" : expired ? "0" : effectiveDays}</span>
          <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
            {isLifetime ? "Lifetime" : expired ? "Expired" : "Days Left"}
          </span>
          {isSample && <span className="mt-0.5 rounded bg-white/5 px-1 text-[8px] font-bold uppercase text-gray-500">Sample</span>}
        </div>
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-sm rounded-2xl border border-[#1E293B] bg-[#121A22] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h2 className="text-base font-bold text-white">
                {isLifetime ? "Lifetime access" : isSample ? "Sample subscription preview" : expired ? "Subscription expired" : "Subscription status"}
              </h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-gray-500 hover:text-gray-300">
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="mt-3 text-sm text-gray-400">
              Plan: <span className="font-semibold text-white">{plan === "business" ? "BUSINESS" : "PRO"}</span>
            </p>
            <p className="mt-1 text-sm text-gray-400">
              Expires:{" "}
              <span className="font-semibold text-white">{isLifetime ? "Never" : isSample ? "—" : expiryLabel}</span>
            </p>

            {!isLifetime && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-gray-500">
                  <span>Days used</span>
                  <span>{isSample ? "—" : `${daysUsed}/30`}</span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${isSample ? 13 : Math.min(100, (daysUsed / 30) * 100)}%`, backgroundColor: color }}
                  />
                </div>
              </div>
            )}

            <div className="mt-4 rounded-xl border border-[#1E293B] bg-white/[0.02] p-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Benefits</p>
              <p className="text-xs leading-relaxed text-gray-400">
                Unlimited filings &amp; GCash uploads, unlimited TaxLaya AI chat, official BIR-ready PDFs + eBIRForms
                export, priority support.
              </p>
            </div>

            {isLifetime ? (
              <p className="mt-5 block w-full rounded-xl bg-[#00FF88]/10 px-4 py-3 text-center text-sm font-bold text-[#00FF88]">
                Lifetime member — no renewal needed
              </p>
            ) : (
              <Link
                href={`/dashboard/settings?promo=${PROMO.code}`}
                onClick={() => setOpen(false)}
                className="mt-5 block w-full rounded-xl bg-[#00FF88] px-4 py-3 text-center text-sm font-bold text-black transition hover:bg-[#00FF88]/90"
              >
                Renew Now — ₱{PROMO.proPricePesos}
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}
