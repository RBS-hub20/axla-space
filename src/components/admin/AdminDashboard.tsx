"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Download, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { StatsCards } from "@/components/admin/StatsCards";
import { JarvisBar } from "@/components/admin/JarvisBar";
import { InvoicesAdminTable } from "@/components/admin/InvoicesAdminTable";
import { ComplianceTable } from "@/components/admin/ComplianceTable";
import { GraphTabs } from "@/components/admin/GraphTabs";
import { PeakHoursCard } from "@/components/admin/PeakHoursCard";
import { TopQuestionsTable } from "@/components/admin/TopQuestionsTable";
import { RecentChatsFeed } from "@/components/admin/RecentChatsFeed";
import { WaitlistTable } from "@/components/admin/WaitlistTable";
import { HateLevelDialog } from "@/components/admin/HateLevelDialog";
import { DateRangeFilter, type DateRange } from "@/components/admin/DateRangeFilter";
import { PaymentsStatsCards } from "@/components/admin/PaymentsStatsCards";
import { RevenueChart } from "@/components/admin/RevenueChart";
import { RecentPaymentsFeed } from "@/components/admin/RecentPaymentsFeed";
import { SubscribersTable } from "@/components/admin/SubscribersTable";
import { UserMap } from "@/components/admin/UserMap";
import { TopReferrerCard } from "@/components/admin/TopReferrerCard";
import type { ChatMessageRow, WaitlistRow } from "@/lib/supabase/admin";
import type { PaymentsPayload } from "@/lib/payments-stats";
import type { ReferralStats } from "@/app/api/referral/stats/route";

type Tab = "overview" | "subscribers" | "compliance";

const AUTO_REFRESH_MS = 30_000;

const RANGE_TO_DAYS: Record<DateRange, number> = { "7d": 7, "30d": 30, all: 90 };

function toCsv(rows: WaitlistRow[]): string {
  const header = "email,bir_hate_level,created_at";
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = rows.map(
    (row) => `${escape(row.email)},${row.bir_hate_level},${escape(row.created_at)}`,
  );
  return [header, ...lines].join("\n");
}

function withinRange<T>(rows: T[], getDate: (row: T) => string, range: DateRange): T[] {
  if (range === "all") return rows;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - (range === "7d" ? 7 : 30));
  return rows.filter((row) => new Date(getDate(row)) >= cutoff);
}

export function AdminDashboard() {
  const router = useRouter();
  const [signups, setSignups] = useState<WaitlistRow[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessageRow[]>([]);
  const [payments, setPayments] = useState<PaymentsPayload | null>(null);
  const [referralStats, setReferralStats] = useState<ReferralStats | null>(null);
  const [totalInvoices, setTotalInvoices] = useState<number | null>(null);
  const [invoicesPaidTotal, setInvoicesPaidTotal] = useState<number | null>(null);
  const [invoicesExpanded, setInvoicesExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [hateDialogOpen, setHateDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>("30d");
  const [tab, setTab] = useState<Tab>("overview");

  const fetchData = useCallback(async () => {
    try {
      const [waitlistRes, chatRes, paymentsRes, referralRes, invoicesRes] = await Promise.all([
        fetch("/api/admin/waitlist", { cache: "no-store" }),
        fetch("/api/admin/chat", { cache: "no-store" }),
        fetch("/api/admin/payments", { cache: "no-store" }),
        fetch("/api/referral/stats", { cache: "no-store" }),
        fetch("/api/admin/invoices", { cache: "no-store" }),
      ]);

      if (waitlistRes.status === 401 || chatRes.status === 401 || paymentsRes.status === 401) {
        router.replace("/admin/login");
        return;
      }

      const waitlistData = await waitlistRes.json();
      const chatData = await chatRes.json();

      if (!waitlistRes.ok) {
        setError(waitlistData.error || "Failed to load waitlist.");
        return;
      }

      setSignups(waitlistData.signups);
      setChatMessages(chatRes.ok ? chatData.messages : []);
      setPayments(paymentsRes.ok ? await paymentsRes.json() : null);
      setReferralStats(referralRes.ok ? await referralRes.json() : null);
      if (invoicesRes.ok) {
        const invoicesData = await invoicesRes.json();
        setTotalInvoices(invoicesData.stats?.count ?? null);
        setInvoicesPaidTotal(invoicesData.stats?.paid ?? null);
      } else {
        setTotalInvoices(null);
        setInvoicesPaidTotal(null);
      }
      setError("");
    } catch {
      setError("Network error while loading dashboard data.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchData]);

  const filteredSignups = useMemo(
    () => withinRange(signups, (s) => s.created_at, dateRange),
    [signups, dateRange],
  );
  const filteredChatMessages = useMemo(
    () => withinRange(chatMessages, (m) => m.created_at, dateRange),
    [chatMessages, dateRange],
  );

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  function handleExport() {
    const csv = toCsv(filteredSignups);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "axla-waitlist.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setExportOpen(false);
  }

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="border-b border-gray-800 bg-gray-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="bg-gradient-to-r from-white to-accent bg-clip-text text-2xl font-extrabold text-transparent">
                Axla Admin 🔥
              </h1>
              <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-gray-300 ring-1 ring-inset ring-white/10">
                Admin v2
              </span>
              <span className="flex items-center gap-1.5 rounded-full bg-taxlaya-green/10 px-2 py-0.5 text-xs font-medium text-taxlaya-green">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-taxlaya-green" />
                Real-time
              </span>
            </div>
            <p className="text-sm text-gray-500">Waitlist + TaxLaya analytics</p>
            <p className="mt-0.5 text-xs text-gray-600">
              AXLA SOFTWARE DEVELOPMENT SERVICES — DTI Registered 2026 | BNRS 8/8 PASSED | E-Invoice Live | Jarvis Enabled
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <DateRangeFilter value={dateRange} onChange={setDateRange} />

            <Button variant="outline" size="sm" onClick={() => fetchData()}>
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>

            <Dialog open={exportOpen} onOpenChange={setExportOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Export waitlist to CSV?</DialogTitle>
                  <DialogDescription>
                    This downloads the {filteredSignups.length} signups in the current{" "}
                    <span className="text-gray-300">
                      {dateRange === "all" ? "all time" : dateRange === "7d" ? "last 7 days" : "last 30 days"}
                    </span>{" "}
                    range as <code className="text-gray-300">axla-waitlist.csv</code>.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button variant="ghost" size="sm" onClick={() => setExportOpen(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleExport}>
                    Download
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button variant="destructive" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>
      </header>

      <JarvisBar />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {error && (
          <div className="rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="flex gap-1 rounded-lg bg-gray-800 p-1">
            <button
              type="button"
              onClick={() => setTab("overview")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                tab === "overview" ? "bg-taxlaya-green text-gray-950" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setTab("subscribers")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                tab === "subscribers" ? "bg-taxlaya-green text-gray-950" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              Subscribers
            </button>
            <button
              type="button"
              onClick={() => setTab("compliance")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                tab === "compliance" ? "bg-taxlaya-green text-gray-950" : "text-gray-400 hover:text-gray-200"
              }`}
            >
              DTI &amp; Compliance
            </button>
          </div>
          {payments?.isMock && (
            <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400 ring-1 ring-inset ring-amber-500/30">
              Demo data — no live payments yet
            </span>
          )}
        </div>

        {loading ? (
          <p className="text-gray-500">Loading dashboard...</p>
        ) : tab === "subscribers" ? (
          payments && <SubscribersTable payments={payments.payments} stats={payments.stats} onRefresh={fetchData} />
        ) : tab === "compliance" ? (
          <ComplianceTable />
        ) : (
          <>
            <StatsCards
              signups={filteredSignups}
              chatMessages={filteredChatMessages}
              onHateLevelClick={() => setHateDialogOpen(true)}
              totalInvoices={totalInvoices}
              onInvoicesClick={() => setInvoicesExpanded((v) => !v)}
            />
            {invoicesExpanded && <InvoicesAdminTable />}
            <div className="grid gap-4 lg:grid-cols-3">
              <UserMap signups={filteredSignups} className="lg:col-span-2" />
              <TopReferrerCard stats={referralStats} />
            </div>
            <GraphTabs
              signups={filteredSignups}
              chatMessages={filteredChatMessages}
              days={RANGE_TO_DAYS[dateRange]}
            />

            {payments && (
              <div className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Revenue</h2>
                <PaymentsStatsCards stats={payments.stats} />
                {invoicesPaidTotal !== null && (
                  <p className="text-xs text-gray-500">
                    Invoices Paid Total: <span className="text-gray-300">PHP {invoicesPaidTotal.toLocaleString()}</span> + PayMongo{" "}
                    <span className="text-gray-300">PHP {payments.stats.totalRevenue.toLocaleString()}</span> = Total Revenue{" "}
                    <span className="font-semibold text-[#00FF88]">
                      PHP {(invoicesPaidTotal + payments.stats.totalRevenue).toLocaleString()}
                    </span>
                  </p>
                )}
                <RevenueChart data={payments.revenueByDay} />
                <RecentPaymentsFeed payments={payments.recentPayments} />
              </div>
            )}

            <PeakHoursCard chatMessages={filteredChatMessages} />
            <div className="grid gap-6 lg:grid-cols-2">
              <TopQuestionsTable chatMessages={filteredChatMessages} />
              <RecentChatsFeed chatMessages={filteredChatMessages} />
            </div>
            <WaitlistTable
              signups={filteredSignups}
              subscriptionsByEmail={payments?.subscriptionsByEmail}
              referralCounts={referralStats?.countsByEmail}
              onActionComplete={fetchData}
            />
          </>
        )}
      </main>

      <HateLevelDialog
        open={hateDialogOpen}
        onOpenChange={setHateDialogOpen}
        signups={filteredSignups}
      />
    </div>
  );
}
