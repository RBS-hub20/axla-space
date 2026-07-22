"use client";

import { useMemo, useState } from "react";
import { Search, ChevronLeft, ChevronRight, Loader2, Link2, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { WaitlistRow } from "@/lib/supabase/admin";
import type { SubscriptionSummary } from "@/lib/payments-stats";

const PAGE_SIZE = 20;

function hateBadgeVariant(level: number): "success" | "warning" | "destructive" {
  if (level <= 3) return "success";
  if (level <= 7) return "warning";
  return "destructive";
}

function planBadgeVariant(plan: string | undefined): "default" | "success" {
  return plan === "pro" || plan === "business" ? "success" : "default";
}

function subStatusBadgeVariant(status: string | undefined): "default" | "success" | "warning" | "destructive" {
  if (status === "active") return "success";
  if (status === "past_due") return "warning";
  if (status === "canceled") return "destructive";
  return "default";
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

interface WaitlistTableProps {
  signups: WaitlistRow[];
  subscriptionsByEmail?: Record<string, SubscriptionSummary>;
  referralCounts?: Record<string, number>;
  onActionComplete?: () => void;
}

const REFERRAL_COPY_RESET_MS = 2000;
const REFERRAL_TOAST_MS = 2000;

export function WaitlistTable({
  signups,
  subscriptionsByEmail = {},
  referralCounts = {},
  onActionComplete,
}: WaitlistTableProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [isBulkBusy, setIsBulkBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return signups;
    return signups.filter((s) => s.email.toLowerCase().includes(query));
  }, [search, signups]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function toggleSelected(email: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(email)) next.delete(email);
      else next.add(email);
      return next;
    });
  }

  async function handleApprove(email: string) {
    setBusyEmail(email);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/waitlist/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(data?.error || `Failed to approve ${email} (HTTP ${res.status}).`);
        return;
      }
      onActionComplete?.();
    } catch {
      setActionError("Network error while approving.");
    } finally {
      setBusyEmail(null);
    }
  }

  async function handleReject(email: string) {
    if (!confirm(`Reject ${email}?`)) return;
    setBusyEmail(email);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/waitlist/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(data?.error || `Failed to reject ${email} (HTTP ${res.status}).`);
        return;
      }
      onActionComplete?.();
    } catch {
      setActionError("Network error while rejecting.");
    } finally {
      setBusyEmail(null);
    }
  }

  async function handleCopyReferralLink(email: string) {
    const link = `https://www.axla.space/?ref=${btoa(email)}`;
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // Clipboard API can be blocked (permissions/non-secure context) — the
      // link itself was still generated correctly, so still show feedback.
    }
    setCopiedEmail(email);
    setToast("Referral link copied! 🔗");
    setTimeout(() => setCopiedEmail((cur) => (cur === email ? null : cur)), REFERRAL_COPY_RESET_MS);
    setTimeout(() => setToast((cur) => (cur === "Referral link copied! 🔗" ? null : cur)), REFERRAL_TOAST_MS);
  }

  async function handleBulkApprove() {
    if (selected.size === 0) return;
    setIsBulkBusy(true);
    setActionError(null);
    try {
      const res = await fetch("/api/admin/waitlist/bulk-approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: Array.from(selected) }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setActionError(data?.error || `Bulk approve failed (HTTP ${res.status}).`);
        return;
      }
      if (data?.failed) {
        setActionError(`${data.approved}/${data.approved + data.failed} approved — ${data.failed} failed.`);
      }
      setSelected(new Set());
      onActionComplete?.();
    } catch {
      setActionError("Network error during bulk approve.");
    } finally {
      setIsBulkBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base font-semibold text-white">
          Waitlist ({filtered.length})
        </CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <Input
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search by email..."
              className="pl-9"
            />
          </div>
          <Button type="button" size="sm" disabled={selected.size === 0 || isBulkBusy} onClick={handleBulkApprove}>
            {isBulkBusy && <Loader2 className="h-4 w-4 animate-spin" />}
            Bulk Approve ({selected.size})
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {actionError && (
          <div className="mb-3 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
            {actionError}
          </div>
        )}
        <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Email</TableHead>
              <TableHead>BIR Hate Level</TableHead>
              <TableHead>Plan</TableHead>
              <TableHead>Sub Status</TableHead>
              <TableHead>Last Payment</TableHead>
              <TableHead>Next Billing</TableHead>
              <TableHead>Date Joined</TableHead>
              <TableHead>Referral Link</TableHead>
              <TableHead>Referrals</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} className="py-8 text-center text-slate-500">
                  No signups found.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row) => {
                const waitlistStatus = row.status || "pending";
                const sub = subscriptionsByEmail[row.email.toLowerCase()];
                const isBusy = busyEmail === row.email;

                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <input
                        type="checkbox"
                        checked={selected.has(row.email)}
                        onChange={() => toggleSelected(row.email)}
                        disabled={waitlistStatus !== "pending"}
                        aria-label={`Select ${row.email}`}
                      />
                    </TableCell>
                    <TableCell className="font-medium text-slate-100">{row.email}</TableCell>
                    <TableCell>
                      <Badge variant={hateBadgeVariant(row.bir_hate_level)}>
                        {row.bir_hate_level}/10
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={planBadgeVariant(sub?.plan)}>{sub?.plan ?? "free"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant={subStatusBadgeVariant(sub?.status)}>{sub?.status ?? "—"}</Badge>
                    </TableCell>
                    <TableCell className="text-slate-400">{formatDate(sub?.lastPayment)}</TableCell>
                    <TableCell className="text-slate-400">{formatDate(sub?.nextBilling)}</TableCell>
                    <TableCell className="text-slate-400">
                      {new Date(row.created_at).toLocaleString("en-PH", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleCopyReferralLink(row.email)}
                        className={copiedEmail === row.email ? "border-taxlaya-green/50 text-taxlaya-green" : undefined}
                      >
                        {copiedEmail === row.email ? (
                          <>
                            <Check className="h-3.5 w-3.5" /> Copied! ✅
                          </>
                        ) : (
                          <>
                            <Link2 className="h-3.5 w-3.5" /> Copy Link
                          </>
                        )}
                      </Button>
                    </TableCell>
                    <TableCell>
                      <Badge variant={(referralCounts[row.email.toLowerCase()] ?? 0) > 0 ? "success" : "default"}>
                        {referralCounts[row.email.toLowerCase()] ?? 0}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={waitlistStatus === "approved" || isBusy}
                          onClick={() => handleApprove(row.email)}
                        >
                          {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Approve"}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          disabled={waitlistStatus === "rejected" || isBusy}
                          onClick={() => handleReject(row.email)}
                        >
                          Reject
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
        </div>

        {toast && (
          <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full border border-taxlaya-green/30 bg-gray-900 px-4 py-2 text-sm font-medium text-taxlaya-green shadow-lg shadow-black/40">
            {toast}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
          <span>
            Page {currentPage} of {pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={currentPage >= pageCount}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
