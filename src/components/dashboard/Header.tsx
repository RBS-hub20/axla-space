"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogOut, Infinity as InfinityIcon } from "lucide-react";
import type { UsageSummary } from "@/lib/usage";

interface HeaderProps {
  userName: string;
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

export function Header({ userName }: HeaderProps) {
  const router = useRouter();
  const [usage, setUsage] = useState<UsageSummary | null>(null);

  useEffect(() => {
    fetch("/api/usage", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setUsage(data))
      .catch(() => {});
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const initial = userName.trim().charAt(0).toUpperCase() || "?";
  const urgent = usage && !usage.isUnlimited ? mostUrgentMetric(usage) : null;

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-[#001A29]/95 px-4 backdrop-blur sm:px-6">
      <span className="pl-10 text-base font-bold text-white md:pl-0">
        Tax<span className="text-[#00FF85]">Laya</span>
      </span>

      <div className="flex items-center gap-3">
        {usage?.isUnlimited && (
          <span className="hidden items-center gap-1 rounded-full bg-[#00FF85]/10 px-2.5 py-1 text-xs font-semibold text-[#00FF85] sm:flex">
            <InfinityIcon className="h-3.5 w-3.5" />
            {usage.plan === "business" ? "Business" : "Pro"}
          </span>
        )}
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
