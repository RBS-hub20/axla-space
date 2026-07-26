"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, Infinity as InfinityIcon, Clock } from "lucide-react";
import type { UsageSummary } from "@/lib/usage";
import { PROMO } from "@/lib/promo";

interface HeaderProps {
  userName: string;
}

interface BillingStatus {
  is_pro: boolean;
  plan: "free" | "pro" | "business";
  currentPeriodEnd: string | null;
  daysLeft: number | null;
}

const METRIC_LABEL = { filings: "filings", scans: "scans", aiChats: "AI chats" } as const;

/** Picks whichever metered quota is closest to running out — the most useful thing to nudge with, not an arbitrary fixed one. */
function mostUrgentMetric(summary: UsageSummary): { label: string; remaining: number; limit: number } | null {
  const candidates = (["filings", "scans", "aiChats"] as const)
    .map((key) => ({ key, ...summary[key] }))
    .filter((m): m is typeof m & { limit: number; remaining: number } => m.limit !== null && m.remaining !== null);

  if (candidates.length === 0) return null;
  const closest = candidates.reduce((a, b) => (a.remaining <= b.remaining ? a : b));
  return { label: METRIC_LABEL[closest.key], remaining: closest.remaining, limit: closest.limit };
}

/** Day-based color/label tiers for the countdown badge — matches the dashboard's SubscriptionRing thresholds so the two never disagree. */
function badgeStyle(daysLeft: number): { classes: string; label: string; pulse: boolean } {
  if (daysLeft <= 0) return { classes: "bg-red-500 text-white border border-red-500", label: "Expired • Renew", pulse: false };
  if (daysLeft <= 2) return { classes: "bg-red-500/20 text-red-400 border border-red-500/30", label: `⏰ ${daysLeft}d left`, pulse: true };
  if (daysLeft <= 7) return { classes: "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30", label: `⏰ Pro • ${daysLeft}d`, pulse: true };
  return { classes: "bg-[#00FF88]/20 text-[#00FF88] border border-[#00FF88]/30", label: `∞ Pro • ${daysLeft}d`, pulse: false };
}

export function Header({ userName }: HeaderProps) {
  const router = useRouter();
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [tooltipOpen, setTooltipOpen] = useState(false);

  useEffect(() => {
    fetch("/api/usage", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setUsage(data))
      .catch(() => {});
    fetch("/api/billing/status", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setBilling(data))
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const initial = userName.trim().charAt(0).toUpperCase() || "?";
  const urgent = usage && !usage.isUnlimited ? mostUrgentMetric(usage) : null;
  const daysLeft = billing?.daysLeft ?? null;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-[#001A29]/95 px-4 backdrop-blur sm:px-6">
      <span className="pl-10 text-base font-bold text-white md:pl-0">
        Tax<span className="text-[#00FF85]">Laya</span>
      </span>

      <div className="flex items-center gap-3">
        {usage?.isUnlimited &&
          (daysLeft !== null ? (
            <div className="relative hidden sm:block" onMouseEnter={() => setTooltipOpen(true)} onMouseLeave={() => setTooltipOpen(false)}>
              {(() => {
                const badge = badgeStyle(daysLeft);
                const content = (
                  <span
                    className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${badge.classes} ${badge.pulse ? "animate-pulse" : ""}`}
                  >
                    {badge.label}
                  </span>
                );
                return daysLeft <= 0 ? (
                  <Link href="/pricing">{content}</Link>
                ) : (
                  content
                );
              })()}

              {tooltipOpen && billing?.currentPeriodEnd && (
                <div className="absolute right-0 top-full z-40 mt-2 w-64 rounded-xl border border-[#1E293B] bg-[#121A22] p-4 shadow-2xl">
                  <p className="text-sm font-bold text-white">{billing.plan === "business" ? "BUSINESS" : "PRO"} Active</p>
                  <p className="mt-1 text-xs text-gray-400">
                    Expires:{" "}
                    <span className="font-semibold text-gray-200">
                      {new Date(billing.currentPeriodEnd).toLocaleDateString("en-PH", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}{" "}
                      11:59 PM
                    </span>
                  </p>
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
                    <div
                      className="h-full rounded-full bg-[#00FF88] transition-all"
                      style={{ width: `${Math.min(100, Math.max(0, ((30 - daysLeft) / 30) * 100))}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[10px] text-gray-500">{Math.max(0, 30 - daysLeft)}/30 days used</p>
                  <Link
                    href={`/dashboard/settings?promo=${PROMO.code}`}
                    className="mt-3 flex items-center justify-center gap-1.5 rounded-lg bg-[#00FF88] px-3 py-2 text-xs font-bold text-black hover:bg-[#00FF88]/90"
                  >
                    <Clock className="h-3 w-3" />
                    Renew Now — ₱{PROMO.proPricePesos}
                  </Link>
                </div>
              )}
            </div>
          ) : (
            <span className="hidden items-center gap-1 rounded-full bg-[#00FF85]/10 px-2.5 py-1 text-xs font-semibold text-[#00FF85] sm:flex">
              <InfinityIcon className="h-3.5 w-3.5" />
              {usage.plan === "business" ? "Business" : "Pro"}
            </span>
          ))}
        {urgent && (
          <Link
            href="/dashboard/settings"
            className="hidden items-center rounded-full border border-white/10 px-2.5 py-1 text-xs font-medium text-slate-300 hover:border-[#00FF85]/40 hover:text-[#00FF85] sm:flex"
          >
            {urgent.remaining}/{urgent.limit} {urgent.label} left
          </Link>
        )}

        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#00FF85]/15 text-sm font-semibold text-[#00FF85]">
            {initial}
          </div>
          <span className="hidden text-sm font-medium text-slate-200 sm:inline">{userName}</span>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          aria-label="Log out"
          className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition-colors hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
