"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, CheckCircle2, X } from "lucide-react";
import { PROMO } from "@/lib/promo";

const SEEN_KEY = "axla_new_features_seen_v2";
const SHOW_DELAY_MS = 1500;

const NEW_FEATURES = [
  { emoji: "✨", title: "Maya", desc: "Wallet CSV auto-detect" },
  { emoji: "✨", title: "BPI / BDO / UnionBank", desc: "Bank CSV/XLSX — no reformat" },
  { emoji: "✨", title: "BIR 1701Q / 1701 / 0619E / 2307", desc: "5 forms total — XML/DAT export" },
  { emoji: "✨", title: "QuickBooks / Xero / Sheets", desc: "One-click accounting export" },
  { emoji: "✨", title: "RDO Packet ZIP", desc: "PDF + XML + receipts + cover letter" },
  { emoji: "✅", title: "GCash", desc: "Still LIVE — improved" },
];

/** First-login announcement for the 6 newly-shipped LIVE integrations — shown once per browser via localStorage, with an explicit "don't show again" opt-out for anyone who dismisses without wanting the delayed re-check. */
export function NewFeaturesModal() {
  const [visible, setVisible] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(SEEN_KEY)) return;
    const timer = setTimeout(() => setVisible(true), SHOW_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  // Closing via X/backdrop without checking the box lets the modal
  // reappear next session (a soft reminder) — checking the box, or
  // clicking through to the CTA, is what actually suppresses it for good.
  function dismiss(suppress: boolean) {
    if (suppress) localStorage.setItem(SEEN_KEY, "1");
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4" onClick={() => dismiss(dontShowAgain)}>
      <div
        className="relative w-full max-w-lg rounded-2xl border p-6 sm:p-8"
        style={{
          background: "linear-gradient(160deg, #001A29 0%, #061F2E 100%)",
          borderColor: "rgba(0,255,133,0.3)",
          boxShadow: "0 0 60px rgba(0,255,133,0.15), 0 0 30px rgba(0,212,255,0.1)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={() => dismiss(dontShowAgain)}
          aria-label="Close"
          className="absolute right-4 top-4 text-slate-500 hover:text-slate-300"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-[#00FF85]" />
          <h2 className="text-lg font-bold text-white sm:text-xl">🚀 6 NEW FEATURES LIVE, Sir!</h2>
        </div>

        <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
          {NEW_FEATURES.map((f) => (
            <div
              key={f.title}
              className="rounded-xl border border-white/10 bg-white/[0.03] p-3"
            >
              <p className="text-sm font-semibold text-white">
                {f.emoji} {f.title}
              </p>
              <p className="mt-0.5 text-xs text-slate-400">{f.desc} LIVE</p>
            </div>
          ))}
        </div>

        <div className="mt-5 flex items-start gap-2 rounded-xl border border-[#00FF85]/20 bg-[#00FF85]/5 px-3 py-2.5">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#00FF85]" />
          <p className="text-xs text-slate-300">All pulling real transaction data, tested in production, Sir.</p>
        </div>

        <Link
          href={`/dashboard/settings?promo=${PROMO.code}`}
          onClick={() => dismiss(true)}
          className="mt-5 block w-full rounded-xl bg-gradient-to-r from-[#00FF85] to-[#00D4FF] px-4 py-3 text-center text-sm font-bold text-[#001A29] shadow-lg shadow-[#00FF85]/20 transition hover:opacity-90"
        >
          Explore Now — 50% OFF PRO ₱{PROMO.proPricePesos}
        </Link>

        <label className="mt-4 flex items-center gap-2 text-xs text-slate-500">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-white/20 bg-transparent accent-[#00FF85]"
          />
          Don&apos;t show this again
        </label>
      </div>
    </div>
  );
}
