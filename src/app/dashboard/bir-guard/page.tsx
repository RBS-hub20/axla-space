"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Shield,
  AlertTriangle,
  Clock,
  Activity,
  Plus,
  Download,
  FileText,
  Lock,
  X,
  Loader2,
  CheckCircle2,
  Upload,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";

interface BirCase {
  id: string;
  form_type: string;
  tax_period: string;
  status: "open" | "penalty" | "filed";
  penalty_amount: number;
  due_date: string | null;
  notes: string | null;
  screenshot_url: string | null;
  screenshot_signed_url?: string | null;
  created_at: string;
  resolved_at: string | null;
}

interface SyncLog {
  id: string;
  status: "success" | "error";
  error_message: string | null;
  created_at: string;
}

const PREMIUM_CARD =
  "rounded-2xl border-[#1E293B] bg-[#121A22] shadow-sm transition hover:border-[#00FF88]/30 hover:shadow-lg hover:shadow-green-500/10";
const PESO = (n: number) => `₱${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const FORM_TYPES = ["2551Q", "1701Q", "1701", "2550Q", "0619E", "1601C", "Other"];

function statusBadge(status: BirCase["status"]) {
  if (status === "filed") return <Badge variant="success">Filed</Badge>;
  if (status === "penalty") return <Badge variant="destructive">Penalty</Badge>;
  return <Badge variant="warning">Open</Badge>;
}

function toast(message: string) {
  // Minimal, dependency-free toast — same self-contained pattern used
  // elsewhere in this codebase (e.g. the WaitlistTable "copied" toast).
  const el = document.createElement("div");
  el.textContent = message;
  el.className =
    "fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-full border border-[#00FF88]/30 bg-[#121A22] px-4 py-2 text-sm font-medium text-[#00FF88] shadow-lg shadow-black/40";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

export default function BirGuardPage() {
  const [cases, setCases] = useState<BirCase[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formType, setFormType] = useState(FORM_TYPES[0]);
  const [taxPeriod, setTaxPeriod] = useState("");
  const [status, setStatus] = useState<BirCase["status"]>("open");
  const [penaltyAmount, setPenaltyAmount] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [letterCaseId, setLetterCaseId] = useState<string | null>(null);
  const [letterText, setLetterText] = useState<string | null>(null);
  const [letterLoading, setLetterLoading] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const casesRes = await fetch("/api/bir-guard/cases", { cache: "no-store" });

      if (casesRes.status === 403) {
        const data = await casesRes.json().catch(() => null);
        if (data?.code === "UPGRADE_REQUIRED") {
          setUpgradeRequired(true);
          return;
        }
      }
      if (!casesRes.ok) {
        setError("Failed to load BIR Guard cases.");
        return;
      }
      const data = await casesRes.json();
      setCases(data.cases ?? []);
      setLogs(data.logs ?? []);
    } catch {
      setError("Network error loading BIR Guard.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleAddCase(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!taxPeriod.trim()) {
      setFormError("Tax period is required (e.g. Q3 2026).");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch("/api/bir-guard/cases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formType,
          taxPeriod: taxPeriod.trim(),
          status,
          penaltyAmount: Number(penaltyAmount) || 0,
          dueDate: dueDate || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Failed to save case.");
        return;
      }
      setIsAddOpen(false);
      setTaxPeriod("");
      setPenaltyAmount("");
      setDueDate("");
      setStatus("open");
      toast("Case added ✅");
      await load();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleMarkFiled(id: string) {
    try {
      const res = await fetch(`/api/bir-guard/cases/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "filed" }),
      });
      if (res.ok) {
        toast("Marked as filed ✅");
        await load();
      }
    } catch {
      toast("Network error — try again.");
    }
  }

  async function handleUploadScreenshot(id: string, file: File) {
    setUploadingId(id);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`/api/bir-guard/cases/${id}/screenshot`, { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Upload failed.");
        return;
      }
      toast("Screenshot attached ✅");
      await load();
    } catch {
      toast("Network error during upload.");
    } finally {
      setUploadingId(null);
    }
  }

  async function handleDraftLetter(id: string) {
    setLetterCaseId(id);
    setLetterText(null);
    setLetterLoading(true);
    try {
      const res = await fetch("/api/bir-guard/draft-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ caseId: id }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Failed to draft letter.");
        setLetterCaseId(null);
        return;
      }
      setLetterText(data.draft);
    } catch {
      toast("Network error. Please try again.");
      setLetterCaseId(null);
    } finally {
      setLetterLoading(false);
    }
  }

  const openCases = cases.filter((c) => c.status !== "filed");
  const totalPenalty = openCases.reduce((sum, c) => sum + Number(c.penalty_amount), 0);
  const upcomingDue = openCases
    .filter((c) => c.due_date)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())[0];
  const daysUntilDue = upcomingDue?.due_date
    ? Math.ceil((new Date(upcomingDue.due_date).getTime() - Date.now()) / 86_400_000)
    : null;
  const lastActivity = logs[0]?.created_at;

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#080F14] px-4 py-6 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Shield className="h-6 w-6 text-[#00FF88]" />
          <h1 className="text-2xl font-bold text-white">BIR Guard</h1>
          <span className="rounded-full bg-[#00FF88]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#00FF88]">
            Beta
          </span>
        </div>

        {upgradeRequired ? (
          <div className="relative">
            <div className={`${PREMIUM_CARD} pointer-events-none select-none space-y-4 p-6 blur-sm`}>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-24 rounded-xl bg-white/5" />
                ))}
              </div>
              <div className="h-48 rounded-xl bg-white/5" />
            </div>
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[#080F14]/50 p-6 text-center">
              <Lock className="h-8 w-8 text-[#00FF88]" />
              <p className="text-lg font-bold text-white">PRO feature — Upgrade to use</p>
              <p className="max-w-sm text-sm text-gray-400">
                Track BIR open cases and penalties in one place. Upgrade to PRO to unlock BIR Guard.
              </p>
              <a
                href="/dashboard/settings"
                className="mt-1 rounded-full bg-[#00FF88] px-5 py-2.5 text-sm font-semibold text-[#080F14] transition hover:bg-[#22C55E]"
              >
                Upgrade to PRO
              </a>
            </div>
          </div>
        ) : (
          <>
            {error && (
              <div className="rounded-2xl border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}

            {/* KPIs */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className={`${PREMIUM_CARD} p-5`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-400">Open Cases</p>
                  <AlertTriangle className="h-4 w-4 text-amber-400" />
                </div>
                <p className="mt-2 text-2xl font-bold text-white">{isLoading ? "—" : openCases.length}</p>
              </div>
              <div className={`${PREMIUM_CARD} p-5`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-400">Total Penalty</p>
                  <Shield className="h-4 w-4 text-red-400" />
                </div>
                <p className="mt-2 text-2xl font-bold text-white">{isLoading ? "—" : PESO(totalPenalty)}</p>
              </div>
              <div className={`${PREMIUM_CARD} p-5`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-400">Next Due</p>
                  <Clock className="h-4 w-4 text-[#00FF88]" />
                </div>
                <p className="mt-2 text-lg font-bold text-white">
                  {isLoading ? "—" : daysUntilDue !== null ? `${Math.max(0, daysUntilDue)}d` : "—"}
                </p>
              </div>
              <div className={`${PREMIUM_CARD} p-5`}>
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-400">Last Updated</p>
                  <Activity className="h-4 w-4 text-[#00FF88]" />
                </div>
                <p className="mt-2 text-sm font-bold text-white">
                  {lastActivity ? new Date(lastActivity).toLocaleDateString("en-PH", { month: "short", day: "numeric" }) : "—"}
                </p>
              </div>
            </div>

            {/* Main table / empty state */}
            <Card className={PREMIUM_CARD}>
              <CardHeader className="flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-semibold text-white">Cases</CardTitle>
                <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm">
                      <Plus className="h-4 w-4" />
                      Add Case
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add a BIR case</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleAddCase} className="space-y-3">
                      <p className="text-xs text-gray-500">
                        Log into <span className="text-gray-300">mytax.bir.gov.ph</span> yourself and record what you
                        see here — BIR Guard doesn&apos;t store your BIR login or check it automatically.
                      </p>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-300">Form Type</label>
                        <select
                          value={formType}
                          onChange={(e) => setFormType(e.target.value)}
                          className="h-10 w-full rounded-lg border border-[#1E293B] bg-[#0B121A] px-3 text-sm text-slate-100"
                        >
                          {FORM_TYPES.map((f) => (
                            <option key={f} value={f}>
                              {f}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-300">Tax Period</label>
                        <Input
                          value={taxPeriod}
                          onChange={(e) => setTaxPeriod(e.target.value)}
                          placeholder="e.g. Q3 2026"
                          className="border-[#1E293B] bg-[#0B121A]"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="mb-1 block text-sm font-medium text-slate-300">Status</label>
                          <select
                            value={status}
                            onChange={(e) => setStatus(e.target.value as BirCase["status"])}
                            className="h-10 w-full rounded-lg border border-[#1E293B] bg-[#0B121A] px-3 text-sm text-slate-100"
                          >
                            <option value="open">Open</option>
                            <option value="penalty">Penalty</option>
                            <option value="filed">Filed</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-sm font-medium text-slate-300">Penalty Amount</label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={penaltyAmount}
                            onChange={(e) => setPenaltyAmount(e.target.value)}
                            placeholder="0"
                            className="border-[#1E293B] bg-[#0B121A]"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-slate-300">Due Date (optional)</label>
                        <Input
                          type="date"
                          value={dueDate}
                          onChange={(e) => setDueDate(e.target.value)}
                          className="border-[#1E293B] bg-[#0B121A]"
                        />
                      </div>
                      {formError && (
                        <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                          {formError}
                        </div>
                      )}
                      <DialogFooter>
                        <Button type="submit" disabled={isSaving} className="w-full">
                          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          {isSaving ? "Saving..." : "Save Case"}
                        </Button>
                      </DialogFooter>
                    </form>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-white/5" />
                    ))}
                  </div>
                ) : cases.length === 0 ? (
                  <div className="flex flex-col items-center gap-3 py-12 text-center">
                    <Shield className="h-10 w-10 text-[#00FF88]" />
                    <p className="text-sm font-semibold text-white">No open cases. You&apos;re clear! ✅</p>
                    <Button size="sm" onClick={() => setIsAddOpen(true)}>
                      <Plus className="h-4 w-4" />
                      Add a Case
                    </Button>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#1E293B] text-left text-xs uppercase tracking-wide text-gray-500">
                          <th className="pb-2 pr-4">Form Type</th>
                          <th className="pb-2 pr-4">Period</th>
                          <th className="pb-2 pr-4">Status</th>
                          <th className="pb-2 pr-4">Penalty</th>
                          <th className="pb-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {cases.map((c) => (
                          <tr key={c.id} className="border-b border-[#1E293B]/60 last:border-0">
                            <td className="py-3 pr-4 font-medium text-white">{c.form_type}</td>
                            <td className="py-3 pr-4 text-gray-300">{c.tax_period}</td>
                            <td className="py-3 pr-4">{statusBadge(c.status)}</td>
                            <td className="py-3 pr-4 text-gray-300">
                              {c.penalty_amount > 0 ? PESO(Number(c.penalty_amount)) : "—"}
                            </td>
                            <td className="py-3">
                              <div className="flex flex-wrap items-center gap-1.5">
                                {c.screenshot_signed_url ? (
                                  <a
                                    href={c.screenshot_signed_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#1E293B] px-2 text-xs text-slate-200 hover:bg-white/5"
                                  >
                                    <Download className="h-3 w-3" />
                                    View
                                  </a>
                                ) : (
                                  <label className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg border border-[#1E293B] px-2 text-xs text-slate-200 hover:bg-white/5">
                                    {uploadingId === c.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <Upload className="h-3 w-3" />
                                    )}
                                    Screenshot
                                    <input
                                      type="file"
                                      accept="image/jpeg,image/png,image/webp"
                                      className="hidden"
                                      onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleUploadScreenshot(c.id, file);
                                        e.target.value = "";
                                      }}
                                    />
                                  </label>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleDraftLetter(c.id)}
                                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#1E293B] px-2 text-xs text-slate-200 hover:bg-white/5"
                                >
                                  <FileText className="h-3 w-3" />
                                  Draft Letter
                                </button>
                                {c.status !== "filed" && (
                                  <button
                                    type="button"
                                    onClick={() => handleMarkFiled(c.id)}
                                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#00FF88]/30 px-2 text-xs text-[#00FF88] hover:bg-[#00FF88]/10"
                                  >
                                    <CheckCircle2 className="h-3 w-3" />
                                    Mark Filed
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Activity log */}
            <Card className={PREMIUM_CARD}>
              <CardHeader>
                <CardTitle className="text-sm font-semibold text-white">Activity Log</CardTitle>
              </CardHeader>
              <CardContent>
                {logs.length === 0 ? (
                  <p className="py-4 text-center text-sm text-gray-500">No activity yet.</p>
                ) : (
                  <ul className="space-y-3">
                    {logs.map((log) => (
                      <li key={log.id} className="flex items-start gap-2 text-sm">
                        <span
                          className={`mt-1 h-2 w-2 shrink-0 rounded-full ${
                            log.status === "success" ? "bg-[#00FF88]" : "bg-red-400"
                          }`}
                        />
                        <div>
                          <p className="text-gray-200">{log.error_message || (log.status === "success" ? "Action completed" : "Action failed")}</p>
                          <p className="text-xs text-gray-500">
                            {new Date(log.created_at).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" })}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </>
        )}

        {/* Draft letter modal */}
        {letterCaseId && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setLetterCaseId(null)}
          >
            <div
              className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#1E293B] bg-[#121A22] p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-bold text-white">Draft Letter</h2>
                <button
                  type="button"
                  onClick={() => setLetterCaseId(null)}
                  className="text-gray-500 hover:text-gray-300"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {letterLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-[#00FF88]" />
                </div>
              ) : (
                <>
                  <pre className="whitespace-pre-wrap rounded-xl border border-[#1E293B] bg-[#0B121A] p-4 text-xs text-gray-300">
                    {letterText}
                  </pre>
                  <Button
                    type="button"
                    className="mt-3 w-full"
                    onClick={() => {
                      if (letterText) navigator.clipboard.writeText(letterText).catch(() => {});
                      toast("Copied to clipboard 📋");
                    }}
                  >
                    Copy Draft
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
