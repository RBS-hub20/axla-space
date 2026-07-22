import { Activity, Building2, Calculator, FileText, Receipt, Settings, Upload } from "lucide-react";
import type { ActivityRow } from "@/lib/dashboard/activity";

const ICONS: Record<string, { icon: typeof Activity; color: string }> = {
  tax_calculated: { icon: Calculator, color: "text-[#22c55e]" },
  form_filed: { icon: FileText, color: "text-[#22c55e]" },
  form_created: { icon: FileText, color: "text-sky-400" },
  gcash_uploaded: { icon: Upload, color: "text-[#22c55e]" },
  receipt_uploaded: { icon: Receipt, color: "text-amber-400" },
  business_created: { icon: Building2, color: "text-slate-400" },
  business_updated: { icon: Building2, color: "text-slate-400" },
  business_deleted: { icon: Building2, color: "text-red-400" },
  business_set_primary: { icon: Building2, color: "text-slate-400" },
  profile_updated: { icon: Settings, color: "text-slate-400" },
};

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

interface RecentActivityTimelineProps {
  activities: ActivityRow[];
}

export function RecentActivityTimeline({ activities }: RecentActivityTimelineProps) {
  if (activities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
        <Activity className="h-8 w-8 text-gray-600" />
        <p className="text-sm text-gray-400">No activity yet.</p>
        <p className="text-xs text-gray-600">Calculate your tax or upload GCash to get started.</p>
      </div>
    );
  }

  return (
    <ul className="relative space-y-1">
      {activities.map((activity, i) => {
        const meta = ICONS[activity.action] ?? { icon: Activity, color: "text-slate-400" };
        const Icon = meta.icon;
        const isLast = i === activities.length - 1;
        return (
          <li key={activity.id} className="relative flex gap-3">
            <div className="relative flex flex-col items-center">
              <span
                className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#1E293B] bg-[#121A22] ${meta.color}`}
              >
                <Icon className="h-4 w-4" />
              </span>
              {!isLast && <span className="w-px flex-1 bg-[#1E293B]" />}
            </div>
            <div className="min-w-0 flex-1 rounded-lg px-2 py-1.5 transition hover:bg-white/5">
              <p className="truncate text-sm text-gray-200">{activity.description}</p>
              <p className="text-xs text-gray-500">{timeAgo(activity.created_at)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
