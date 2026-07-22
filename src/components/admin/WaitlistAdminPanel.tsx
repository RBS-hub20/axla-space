"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Download, Loader2, Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type Status = "pending" | "approved" | "rejected";

interface WaitlistEntry {
  id: string;
  email: string;
  name: string | null;
  business_name: string | null;
  status: Status | null;
  created_at: string;
}

interface Counts {
  pending: number;
  approved: number;
  rejected: number;
  total: number;
}

const STATUS_FILTERS: Array<{ label: string; value: "all" | Status }> = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Approved", value: "approved" },
  { label: "Rejected", value: "rejected" },
];

function statusBadgeVariant(status: Status | null): "default" | "success" | "destructive" {
  if (status === "approved") return "success";
  if (status === "rejected") return "destructive";
  return "default";
}

function toCsv(rows: WaitlistEntry[]): string {
  const header = ["email", "name", "business_name", "status", "created_at"];
  const lines = rows.map((r) =>
    [r.email, r.name ?? "", r.business_name ?? "", r.status ?? "pending", r.created_at]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-[#162032] p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

export function WaitlistAdminPanel() {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [counts, setCounts] = useState<Counts>({ pending: 0, approved: 0, rejected: 0, total: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | Status>("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [isBulkApproving, setIsBulkApproving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<WaitlistEntry | null>(null);
  const [approveBusinessName, setApproveBusinessName] = useState("");
  const [isApproving, setIsApproving] = useState(false);
  const [approveError, setApproveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/waitlist/list", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) {
        setLoadError(data.error || "Failed to load waitlist.");
        return;
      }
      setEntries(data.waitlist ?? []);
      setCounts(data.counts ?? { pending: 0, approved: 0, rejected: 0, total: 0 });
    } catch {
      setLoadError("Network error.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return entries.filter((e) => {
      const status = e.status || "pending";
      if (statusFilter !== "all" && status !== statusFilter) return false;
      if (!query) return true;
      return (
        e.email.toLowerCase().includes(query) ||
        (e.name ?? "").toLowerCase().includes(query) ||
        (e.business_name ?? "").toLowerCase().includes(query)
      );
    });
  }, [entries, search, statusFilter]);

  function toggleSelected(email: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  function openApprove(entry: WaitlistEntry) {
    setApproveTarget(entry);
    setApproveBusinessName(entry.business_name || entry.name || "");
    setApproveError(null);
  }

  async function handleApprove(e: React.FormEvent) {
    e.preventDefault();
    if (!approveTarget) return;
    setIsApproving(true);
    setApproveError(null);
    try {
      const res = await fetch("/api/admin/waitlist/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: approveTarget.email, customBusinessName: approveBusinessName }),
      });
      const data = await res.json();
      if (!res.ok) {
        setApproveError(data.error || "Failed to approve.");
        return;
      }
      setApproveTarget(null);
      setToast(`Approved ${approveTarget.email}${data.businessCreated ? " — business created" : ""}`);
      await load();
    } catch {
      setApproveError("Network error.");
    } finally {
      setIsApproving(false);
    }
  }

  async function handleReject(entry: WaitlistEntry) {
    if (!confirm(`Reject ${entry.email}?`)) return;
    setBusyEmail(entry.email);
    try {
      const res = await fetch("/api/admin/waitlist/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: entry.email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast(data.error || "Failed to reject.");
        return;
      }
      setToast(`Rejected ${entry.email}`);
      await load();
    } finally {
      setBusyEmail(null);
    }
  }

  async function handleBulkApprove() {
    if (selected.size === 0) return;
    setIsBulkApproving(true);
    try {
      const res = await fetch("/api/admin/waitlist/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: Array.from(selected) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast(data.error || "Bulk approve failed.");
        return;
      }
      setToast(`Approved ${data.approved}/${selected.size}${data.failed ? `, ${data.failed} failed` : ""}`);
      setSelected(new Set());
      await load();
    } finally {
      setIsBulkApproving(false);
    }
  }

  function handleExportCsv() {
    const csv = toCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="min-h-screen bg-[#0f1a2a] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Waitlist</h1>
          <p className="text-sm text-slate-400">Approve, reject, and manage early access.</p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Pending" value={counts.pending} />
          <StatCard label="Approved" value={counts.approved} />
          <StatCard label="Rejected" value={counts.rejected} />
          <StatCard label="Total" value={counts.total} />
        </div>

        <Card className="border-white/10 bg-[#162032]">
          <CardHeader className="flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base font-semibold text-white">Signups ({filtered.length})</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full max-w-xs">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search email, name, business..."
                  className="pl-9"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "all" | Status)}
                className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"
              >
                {STATUS_FILTERS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
              <Button type="button" variant="outline" size="sm" onClick={handleExportCsv}>
                <Download className="h-4 w-4" />
                Export CSV
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={selected.size === 0 || isBulkApproving}
                onClick={handleBulkApprove}
              >
                {isBulkApproving && <Loader2 className="h-4 w-4 animate-spin" />}
                Bulk Approve ({selected.size})
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loadError && (
              <div className="mb-3 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
                {loadError}
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8"></TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Business</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-slate-500">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-slate-500">
                      No signups found.
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map((entry) => {
                    const status = entry.status || "pending";
                    return (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={selected.has(entry.email)}
                            onChange={() => toggleSelected(entry.email)}
                            disabled={status !== "pending"}
                          />
                        </TableCell>
                        <TableCell className="font-medium text-slate-100">{entry.email}</TableCell>
                        <TableCell className="text-slate-300">{entry.name || "—"}</TableCell>
                        <TableCell className="text-slate-300">{entry.business_name || "—"}</TableCell>
                        <TableCell className="text-slate-400">
                          {new Date(entry.created_at).toLocaleDateString("en-PH", { dateStyle: "medium" })}
                        </TableCell>
                        <TableCell>
                          <Badge variant={statusBadgeVariant(status)}>{status}</Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex gap-2">
                            <Button
                              type="button"
                              size="sm"
                              disabled={status === "approved" || busyEmail === entry.email}
                              onClick={() => openApprove(entry)}
                            >
                              Approve
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={status === "rejected" || busyEmail === entry.email}
                              onClick={() => handleReject(entry)}
                            >
                              {busyEmail === entry.email ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Reject"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={Boolean(approveTarget)} onOpenChange={(open) => !open && setApproveTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve {approveTarget?.email}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleApprove} className="space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Business name</label>
              <Input
                value={approveBusinessName}
                onChange={(e) => setApproveBusinessName(e.target.value)}
                placeholder="e.g. Juan Dela Cruz Freelance Design"
              />
              <p className="mt-1 text-xs text-slate-500">
                Used to auto-create their first business if they don&apos;t have one yet.
              </p>
            </div>

            {approveError && (
              <div className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
                {approveError}
              </div>
            )}

            <DialogFooter>
              <Button type="submit" disabled={isApproving}>
                {isApproving && <Loader2 className="h-4 w-4 animate-spin" />}
                {isApproving ? "Approving..." : "Approve & send login code"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[#00ff88]/30 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-100 shadow-2xl shadow-black/40"
        >
          <CheckCircle2 className="h-4 w-4 text-[#00ff88]" />
          {toast}
        </div>
      )}
    </div>
  );
}
