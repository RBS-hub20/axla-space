"use client";

import { Infinity as InfinityIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { UsageSummary } from "@/lib/usage";

interface UsageMeterProps {
  summary: UsageSummary | null;
  isLoading?: boolean;
}

function barColor(percentUsed: number): string {
  if (percentUsed >= 80) return "bg-red-500";
  if (percentUsed >= 60) return "bg-amber-400";
  return "bg-[#00FF85]";
}

function UsageRow({
  label,
  used,
  limit,
  remaining,
}: {
  label: string;
  used: number;
  limit: number | null;
  remaining: number | null;
}) {
  if (limit === null) {
    return (
      <div>
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="text-slate-300">{label}</span>
          <span className="flex items-center gap-1 font-semibold text-[#00FF85]">
            <InfinityIcon className="h-4 w-4" />
            UNLIMITED
          </span>
        </div>
        <div className="h-2 w-full rounded-full bg-[#00FF85]/20">
          <div className="h-2 w-full rounded-full bg-[#00FF85]" />
        </div>
      </div>
    );
  }

  const percentUsed = limit === 0 ? 100 : Math.min(100, Math.round((used / limit) * 100));
  const percentRemaining = 100 - percentUsed;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-slate-300">{label}</span>
        <span className="text-slate-400">
          {used}/{limit} used &middot; {percentRemaining}% remaining
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-slate-800">
        <div
          className={cn("h-2 rounded-full transition-all", barColor(percentUsed))}
          style={{ width: `${percentUsed}%` }}
        />
      </div>
    </div>
  );
}

export function UsageMeter({ summary, isLoading }: UsageMeterProps) {
  if (isLoading || !summary) {
    return <p className="text-sm text-slate-400">Loading usage...</p>;
  }

  if (summary.isUnlimited) {
    return (
      <div className="rounded-lg border border-[#00FF85]/30 bg-[#00FF85]/5 px-4 py-3">
        <p className="flex items-center gap-2 text-sm font-semibold text-[#00FF85]">
          <InfinityIcon className="h-4 w-4" />
          UNLIMITED &mdash; {summary.plan === "business" ? "Business" : "Pro"} Plan Active
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <UsageRow label="Filings this quarter" used={summary.filings.used} limit={summary.filings.limit} remaining={summary.filings.remaining} />
      <UsageRow label="Receipt scans this month" used={summary.scans.used} limit={summary.scans.limit} remaining={summary.scans.remaining} />
      <UsageRow label="AI chats today" used={summary.aiChats.used} limit={summary.aiChats.limit} remaining={summary.aiChats.remaining} />
    </div>
  );
}
