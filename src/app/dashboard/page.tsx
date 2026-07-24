import { redirect } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  Briefcase,
  Calculator,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  FileText,
  Infinity as InfinityIcon,
  Lightbulb,
  TrendingDown,
  TrendingUp,
  Upload,
} from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { getOrCreateProfile } from "@/lib/dashboard/profile";
import { getOverviewStats, getRevenueTimeline } from "@/lib/dashboard/overview";
import { getRecentActivities } from "@/lib/dashboard/activity";
import { getCurrentQuarter } from "@/lib/dashboard/quarter";
import { getBusinesses } from "@/lib/dashboard/businesses";
import { getUsageSummary } from "@/lib/usage";
import { BusinessSwitcher } from "@/components/dashboard/BusinessSwitcher";
import { TaxHealthGauge } from "@/components/dashboard/TaxHealthGauge";
import { MiniSparkline } from "@/components/dashboard/MiniSparkline";
import { RevenueTimelineChart } from "@/components/dashboard/RevenueTimelineChart";
import { RecentActivityTimeline } from "@/components/dashboard/RecentActivityTimeline";

const PESO = (n: number) => `₱${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const QUICK_ACTIONS = [
  {
    href: "/dashboard/calculator",
    label: "Calculate Tax",
    description: "Compute your quarterly tax due",
    icon: Calculator,
  },
  {
    href: "/dashboard/forms",
    label: "File BIR Form",
    description: "Generate a BIR-ready PDF",
    icon: FileText,
  },
  {
    href: "/dashboard/upload",
    label: "Upload GCash",
    description: "Auto-import your transactions",
    icon: Upload,
  },
  {
    href: "/dashboard/toolkit",
    label: "Business Toolkit (NEW)",
    description: "Open, close, or SPA docs in one click",
    icon: Briefcase,
  },
];

function TrendBadge({ pct }: { pct: number | null }) {
  if (pct === null) return null;
  const positive = pct >= 0;
  return (
    <span className={`text-xs font-semibold ${positive ? "text-[#22c55e]" : "text-red-400"}`}>
      {positive ? "+" : ""}
      {pct}%
    </span>
  );
}

export default async function DashboardPage({ searchParams }: { searchParams: { business?: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [profile, businesses] = await Promise.all([
    getOrCreateProfile(user.id, user.email, user.name ?? user.email.split("@")[0]),
    getBusinesses(user.id),
  ]);
  const taxType = profile?.tax_type ?? "8%";
  const displayName = profile?.full_name || user.name || user.email;

  // Default to the primary business (never "All Businesses") unless the
  // user explicitly picked something via the switcher, or explicitly asked
  // for "all". Falls through to consolidated/untagged data when the user
  // has no businesses set up yet — same behavior as before this feature.
  const primaryBusiness = businesses.find((b) => b.is_primary) ?? businesses[0] ?? null;
  const requestedBusiness = searchParams.business;
  const selectedBusinessId =
    requestedBusiness === "all" ? null : requestedBusiness || primaryBusiness?.id || null;

  const [stats, timeline, activities, usage] = await Promise.all([
    getOverviewStats(user.id, taxType, selectedBusinessId),
    getRevenueTimeline(user.id, selectedBusinessId, 6),
    getRecentActivities(user.id, 6),
    getUsageSummary(user.id, user.email),
  ]);
  const { quarter, year } = getCurrentQuarter();

  const incomeSpark = timeline.months.map((m) => ({ value: m.income }));
  const expenseSpark = timeline.months.map((m) => ({ value: m.expenses }));

  const dueDate = stats.nextDeadline ? new Date(stats.nextDeadline.dueDate) : null;
  const daysLeft = dueDate ? Math.max(0, Math.ceil((dueDate.getTime() - Date.now()) / 86_400_000)) : null;
  const deadlineUrgent = daysLeft !== null && daysLeft <= 7;

  const quarterStart = new Date(Date.UTC(year, (quarter - 1) * 3, 1));
  const periodProgressPct = dueDate
    ? Math.min(
        100,
        Math.max(
          0,
          Math.round(((Date.now() - quarterStart.getTime()) / (dueDate.getTime() - quarterStart.getTime())) * 100),
        ),
      )
    : 0;

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#080F14] px-4 py-6 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="space-y-6">
        {/* Hero */}
        <div className="rounded-2xl border border-[#1E293B] bg-[#121A22] p-6 shadow-sm">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold text-white">Welcome, {displayName}!</h1>
                {usage.isUnlimited ? (
                  <span className="flex items-center gap-1.5 rounded-full bg-[#22c55e]/10 px-3 py-1 text-xs font-bold text-[#22c55e]">
                    <InfinityIcon className="h-3.5 w-3.5" />
                    {usage.plan === "business" ? "BUSINESS" : "PRO"}
                  </span>
                ) : (
                  <Link
                    href="/dashboard/settings"
                    className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300 hover:border-[#22c55e]/40"
                  >
                    <span className="font-bold text-white">FREE</span>
                    <span>
                      {usage.filings.used}/{usage.filings.limit} filings · {usage.scans.used}/{usage.scans.limit} scans
                    </span>
                    <span className="rounded-full bg-[#22c55e] px-2 py-0.5 font-bold text-[#001A29]">Upgrade</span>
                  </Link>
                )}
              </div>
              {businesses.length > 0 && (
                <BusinessSwitcher
                  businesses={businesses.map((b) => ({ id: b.id, name: b.name, isPrimary: b.is_primary }))}
                  selectedId={requestedBusiness === "all" ? "all" : selectedBusinessId}
                />
              )}
            </div>
            <TaxHealthGauge score={stats.taxHealthScore} />
          </div>
        </div>

        {timeline.hasData && (
          <Link
            href="/dashboard/forms"
            className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-[#22c55e]/30 bg-[#22c55e]/[0.06] px-5 py-3 text-sm transition hover:border-[#22c55e]/50 hover:bg-[#22c55e]/10"
          >
            <span className="text-gray-200">
              📄 2551Q data ready — export a reference file for eBIRForms
            </span>
            <span className="flex items-center gap-1 font-semibold text-[#22c55e]">
              Download XML
              <ChevronRight className="h-4 w-4" />
            </span>
          </Link>
        )}

        {/* Top row: 4 stat cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-[#1E293B] bg-[#121A22] p-5 shadow-sm transition hover:border-[#22c55e]/30 hover:shadow-lg hover:shadow-green-500/10">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-400">
                Income (Q{quarter} {year})
              </p>
              <TrendingUp className="h-4 w-4 text-[#22c55e]" />
            </div>
            <p className="mt-2 text-2xl font-bold text-white">{PESO(stats.totalIncomeThisQuarter)}</p>
            <div className="mt-1 flex items-center gap-2">
              <TrendBadge pct={timeline.incomeTrendPct} />
              <div className="h-9 flex-1">
                <MiniSparkline data={incomeSpark} variant="area" color="#22c55e" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#1E293B] bg-[#121A22] p-5 shadow-sm transition hover:border-[#22c55e]/30 hover:shadow-lg hover:shadow-green-500/10">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-400">
                Expenses (Q{quarter} {year})
              </p>
              <TrendingDown className="h-4 w-4 text-amber-400" />
            </div>
            <p className="mt-2 text-2xl font-bold text-white">{PESO(stats.totalExpensesThisQuarter)}</p>
            <div className="mt-1 flex items-center gap-2">
              <TrendBadge pct={timeline.expensesTrendPct} />
              <div className="h-9 flex-1">
                <MiniSparkline data={expenseSpark} variant="bar" color="#f59e0b" />
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#1E293B] bg-[#121A22] p-5 shadow-sm transition hover:border-[#22c55e]/30 hover:shadow-lg hover:shadow-green-500/10">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-400">
                Tax Due (Q{quarter} {year})
              </p>
              <Calculator className="h-4 w-4 text-[#22c55e]" />
            </div>
            <p className="mt-2 text-2xl font-bold text-white">{PESO(stats.taxDueThisQuarter)}</p>
            <div className="mt-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-gray-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-[#22c55e] to-emerald-400"
                  style={{ width: `${periodProgressPct}%` }}
                />
              </div>
              <p className="mt-1.5 text-[11px] text-gray-500">{periodProgressPct}% of filing period elapsed</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#1E293B] bg-[#121A22] p-5 shadow-sm transition hover:border-[#22c55e]/30 hover:shadow-lg hover:shadow-green-500/10">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-400">Next Deadline ({stats.nextDeadline?.formType})</p>
              <CalendarClock className="h-4 w-4 text-[#22c55e]" />
            </div>
            <p className="mt-2 text-lg font-bold text-white">
              {dueDate ? dueDate.toLocaleDateString("en-PH", { month: "long", day: "numeric" }) : "—"}
            </p>
            {daysLeft !== null && (
              <span
                className={`mt-3 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
                  deadlineUrgent ? "bg-red-500/15 text-red-400" : "bg-amber-500/15 text-amber-400"
                }`}
              >
                {daysLeft} day{daysLeft === 1 ? "" : "s"} left
              </span>
            )}
          </div>
        </div>

        {/* Middle row: revenue timeline + quick actions */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="rounded-2xl border border-[#1E293B] bg-[#121A22] p-5 shadow-sm lg:col-span-2">
            <h2 className="text-sm font-semibold text-white">Revenue Timeline</h2>
            <p className="text-xs text-gray-500">Last 6 months</p>
            <div className="mt-4">
              <RevenueTimelineChart months={timeline.months} hasData={timeline.hasData} />
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="px-1 text-sm font-semibold text-white">Quick Actions</h2>
            {QUICK_ACTIONS.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="group flex items-center gap-4 rounded-2xl border border-[#1E293B] bg-[#121A22] p-4 shadow-sm transition hover:border-[#22c55e]/40 hover:shadow-lg hover:shadow-green-500/10"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#22c55e]/10 text-[#22c55e] transition group-hover:bg-[#22c55e]/20">
                  <action.icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-white">{action.label}</p>
                  <p className="text-xs text-gray-500">{action.description}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-gray-600 transition group-hover:translate-x-0.5 group-hover:text-[#22c55e]" />
              </Link>
            ))}
          </div>
        </div>

        {/* Bottom row: tax status + recent activity */}
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-[#1E293B] bg-[#121A22] p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-white">Your Tax Status</h2>
            <div className="mt-3 flex items-start gap-3">
              {stats.hasPendingFiling ? (
                <>
                  <AlertTriangle className="h-8 w-8 shrink-0 text-amber-400" />
                  <div>
                    <p className="text-sm font-semibold text-white">Draft filing pending</p>
                    <p className="text-sm text-gray-400">
                      You have a draft {stats.nextDeadline?.formType} waiting to be filed.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-8 w-8 shrink-0 text-[#22c55e]" />
                  <div>
                    <p className="text-sm font-semibold text-white">All clear!</p>
                    <p className="text-sm text-gray-400">No pending filings this quarter.</p>
                  </div>
                </>
              )}
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-[#1E293B] bg-white/[0.02] p-3">
              <Lightbulb className="h-4 w-4 shrink-0 text-[#22c55e]" />
              <p className="text-xs text-gray-400">
                <span className="font-medium text-gray-300">TaxLaya tip:</span> Save your receipts — itemized
                expenses can lower what you owe compared to the flat 8% rate.
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#1E293B] bg-[#121A22] p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-white">Recent Activity</h2>
            <div className="mt-3">
              <RecentActivityTimeline activities={activities} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
