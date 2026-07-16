"use client";

import { useCallback, useEffect, useState } from "react";
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
import { SignupChart } from "@/components/admin/SignupChart";
import { WaitlistTable } from "@/components/admin/WaitlistTable";
import type { WaitlistRow } from "@/lib/supabase/admin";

const AUTO_REFRESH_MS = 30_000;

function toCsv(rows: WaitlistRow[]): string {
  const header = "email,bir_hate_level,created_at";
  const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
  const lines = rows.map(
    (row) => `${escape(row.email)},${row.bir_hate_level},${escape(row.created_at)}`,
  );
  return [header, ...lines].join("\n");
}

export function AdminDashboard() {
  const router = useRouter();
  const [signups, setSignups] = useState<WaitlistRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportOpen, setExportOpen] = useState(false);

  const fetchSignups = useCallback(async () => {
    try {
      const res = await fetch("/api/admin/waitlist", { cache: "no-store" });

      if (res.status === 401) {
        router.replace("/admin/login");
        return;
      }

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to load waitlist.");
        return;
      }

      setSignups(data.signups);
      setError("");
    } catch {
      setError("Network error while loading waitlist.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchSignups();
    const interval = setInterval(fetchSignups, AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [fetchSignups]);

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.replace("/admin/login");
    router.refresh();
  }

  function handleExport() {
    const csv = toCsv(signups);
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
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h1 className="bg-gradient-to-r from-white to-accent bg-clip-text text-2xl font-extrabold text-transparent">
              Axla Admin 🔥
            </h1>
            <p className="text-sm text-slate-500">Waitlist dashboard</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fetchSignups()}>
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
                    This downloads all {signups.length} signups as{" "}
                    <code className="text-slate-300">axla-waitlist.csv</code>.
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

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {error && (
          <div className="rounded-lg border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-slate-500">Loading waitlist...</p>
        ) : (
          <>
            <StatsCards signups={signups} />
            <SignupChart signups={signups} />
            <WaitlistTable signups={signups} />
          </>
        )}
      </main>
    </div>
  );
}
