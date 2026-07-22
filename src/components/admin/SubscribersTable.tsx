"use client";

import { useMemo, useState } from "react";
import { Loader2, Smartphone, CreditCard, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PaymentsStats, RecentPayment } from "@/lib/payments-stats";

type Filter = "all" | "pro" | "business" | "failed";

const FILTERS: Array<{ label: string; value: Filter }> = [
  { label: "All", value: "all" },
  { label: "Pro", value: "pro" },
  { label: "Business", value: "business" },
  { label: "Failed", value: "failed" },
];

const METHOD_INFO: Record<string, { icon: typeof Smartphone; label: string; color: string }> = {
  gcash: { icon: Smartphone, label: "GCash", color: "text-blue-400" },
  maya: { icon: Smartphone, label: "Maya", color: "text-emerald-400" },
  card: { icon: CreditCard, label: "Card", color: "text-slate-300" },
};

function methodInfo(method: string | null) {
  return METHOD_INFO[method ?? ""] ?? { icon: Wallet, label: "Other", color: "text-slate-400" };
}

function statusVariant(status: string): "success" | "warning" | "destructive" {
  if (status === "paid") return "success";
  if (status === "pending") return "warning";
  return "destructive";
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-bold text-white">{value}</p>
    </div>
  );
}

interface ManageState {
  email: string;
  plan: "pro" | "business";
  status: "active" | "past_due" | "canceled" | "trial";
}

export function SubscribersTable({
  payments,
  stats,
  onRefresh,
}: {
  payments: RecentPayment[];
  stats: PaymentsStats;
  onRefresh: () => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<RecentPayment | null>(null);
  const [managing, setManaging] = useState<ManageState | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [manageError, setManageError] = useState<string | null>(null);

  const totalSubscribers = useMemo(
    () => new Set(payments.filter((p) => p.status === "paid").map((p) => p.email.toLowerCase())).size,
    [payments],
  );
  const newToday = useMemo(() => payments.filter((p) => p.status === "paid" && isToday(p.createdAt)).length, [payments]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return payments.filter((p) => {
      if (filter === "pro" && p.plan !== "pro") return false;
      if (filter === "business" && p.plan !== "business") return false;
      if (filter === "failed" && p.status !== "failed") return false;
      if (query && !p.email.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [payments, filter, search]);

  function openManage(p: RecentPayment) {
    setManageError(null);
    setManaging({
      email: p.email,
      plan: p.plan === "business" ? "business" : "pro",
      status: "active",
    });
  }

  async function handleSaveManage() {
    if (!managing) return;
    setIsSaving(true);
    setManageError(null);
    try {
      const res = await fetch("/api/admin/subscribers/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: managing.email, plan: managing.plan, status: managing.status }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setManageError(data?.error || `Failed (HTTP ${res.status}).`);
        return;
      }
      setManaging(null);
      onRefresh();
    } catch {
      setManageError("Network error.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Total Subscribers" value={totalSubscribers.toLocaleString()} />
        <StatTile label="MRR" value={`₱${stats.mrr.toLocaleString()}`} />
        <StatTile label="New Today" value={newToday.toLocaleString()} />
      </div>

      <Card>
        <CardHeader className="flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
          <CardTitle className="text-base font-semibold text-white">Subscribers ({filtered.length})</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search email..."
              className="max-w-xs"
            />
            <div className="flex gap-1 rounded-lg bg-gray-800 p-1">
              {FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setFilter(f.value)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                    filter === f.value ? "bg-taxlaya-green text-gray-950" : "text-gray-400 hover:text-gray-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-gray-500">
                    No subscribers found.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((p) => {
                  const method = methodInfo(p.paymentMethod);
                  const Icon = method.icon;
                  return (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium text-gray-100">{p.email}</TableCell>
                      <TableCell>
                        <Badge variant={p.plan === "business" ? "success" : "default"}>{p.plan ?? "—"}</Badge>
                      </TableCell>
                      <TableCell className="font-medium text-taxlaya-green">
                        {p.currency} {p.amount.toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <span className={`flex items-center gap-1.5 ${method.color}`}>
                          <Icon className="h-4 w-4" />
                          {method.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                      </TableCell>
                      <TableCell className="text-gray-400">
                        {new Date(p.createdAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => setViewing(p)}>
                            View
                          </Button>
                          <Button type="button" size="sm" onClick={() => openManage(p)}>
                            Manage
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

      <Dialog open={Boolean(viewing)} onOpenChange={(open) => !open && setViewing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{viewing?.email}</DialogTitle>
            <DialogDescription>Payment details</DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-2 text-sm">
              <div className="flex justify-between border-b border-gray-800 pb-2">
                <span className="text-gray-500">Payment ID</span>
                <span className="font-mono text-gray-200">{viewing.id}</span>
              </div>
              <div className="flex justify-between border-b border-gray-800 pb-2">
                <span className="text-gray-500">Plan</span>
                <span className="text-gray-200">{viewing.plan ?? "—"}</span>
              </div>
              <div className="flex justify-between border-b border-gray-800 pb-2">
                <span className="text-gray-500">Amount</span>
                <span className="text-gray-200">
                  {viewing.currency} {viewing.amount.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between border-b border-gray-800 pb-2">
                <span className="text-gray-500">Provider</span>
                <span className="capitalize text-gray-200">{viewing.provider}</span>
              </div>
              <div className="flex justify-between border-b border-gray-800 pb-2">
                <span className="text-gray-500">Method</span>
                <span className="text-gray-200">{methodInfo(viewing.paymentMethod).label}</span>
              </div>
              <div className="flex justify-between border-b border-gray-800 pb-2">
                <span className="text-gray-500">Status</span>
                <span className="text-gray-200">{viewing.status}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Date</span>
                <span className="text-gray-200">{new Date(viewing.createdAt).toLocaleString("en-PH")}</span>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(managing)} onOpenChange={(open) => !open && setManaging(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Manage {managing?.email}</DialogTitle>
            <DialogDescription>
              Manually set this subscriber's plan/status — use this to fix a missed webhook or handle a support request.
            </DialogDescription>
          </DialogHeader>
          {managing && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Plan</label>
                <select
                  value={managing.plan}
                  onChange={(e) => setManaging({ ...managing, plan: e.target.value as "pro" | "business" })}
                  className="h-10 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 text-sm text-gray-100"
                >
                  <option value="pro">Pro</option>
                  <option value="business">Business</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-300">Status</label>
                <select
                  value={managing.status}
                  onChange={(e) =>
                    setManaging({ ...managing, status: e.target.value as ManageState["status"] })
                  }
                  className="h-10 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 text-sm text-gray-100"
                >
                  <option value="active">Active</option>
                  <option value="past_due">Past Due</option>
                  <option value="canceled">Canceled</option>
                  <option value="trial">Trial</option>
                </select>
              </div>
              {manageError && (
                <div className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
                  {manageError}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button type="button" disabled={isSaving} onClick={handleSaveManage}>
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
