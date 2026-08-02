"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
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
  FileWarning,
  ArrowLeftRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RdoPicker, parseRdoValue, formatRdoValue } from "@/components/dashboard/RdoPicker";
import { PLAN_PRICING } from "@/lib/plans";
import { PROMO, isPromoActive } from "@/lib/promo";
import { calcBirPenalty } from "@/lib/bir-guard/penalty";

type Plan = "free" | "pro" | "business";

interface BirCase {
  id: string;
  form_type: string;
  tax_period: string;
  status: "open" | "penalty" | "filed";
  penalty_amount: number;
  tax_due_amount: number;
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

interface LoaCase {
  id: string;
  loa_no: string;
  rdo: string;
  received_date: string;
  deadline: string;
  status: "open" | "submitted" | "closed";
  created_at: string;
}

const PREMIUM_CARD =
  "rounded-2xl border-[#1E293B] bg-[#121A22] shadow-sm transition hover:border-[#00FF88]/30 hover:shadow-lg hover:shadow-green-500/10";
const PESO = (n: number) => `₱${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const FORM_TYPES = ["1701", "1701Q", "2551Q", "1601C", "0619E", "1601EQ", "2550Q", "Other"];
const PRO_PRICE = isPromoActive() ? PROMO.proPricePesos : PLAN_PRICING.pro.monthly;
const BUSINESS_PRICE = PLAN_PRICING.business.monthly;

const RDO_CHECKLIST_ITEMS = [
  { id: "form_1905", label: "Accomplished BIR Form 1905" },
  { id: "valid_id", label: "Valid government-issued ID" },
  { id: "cor", label: "Original COR (Certificate of Registration / Form 2303)" },
  { id: "books", label: "Registered Books of Accounts" },
  { id: "unused_receipts", label: "Unused Official Receipts/Invoices (for cancellation)" },
  { id: "sec_cert", label: "Board Resolution / Secretary's Certificate (corporations only)" },
  { id: "transfer_letter", label: "Application letter addressed to the new RDO" },
];

function statusBadge(status: BirCase["status"]) {
  if (status === "filed") return <Badge variant="success">Filed</Badge>;
  if (status === "penalty") return <Badge variant="destructive">Penalty</Badge>;
  return <Badge variant="warning">Open</Badge>;
}

function loaStatusBadge(status: LoaCase["status"]) {
  if (status === "closed") return <Badge variant="success">Closed</Badge>;
  if (status === "submitted") return <Badge variant="default">Submitted</Badge>;
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

function TabButton({ active, onClick, icon, label, locked }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string; locked?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
        active ? "bg-[#00FF88] text-black" : "text-gray-400 hover:bg-white/5 hover:text-white"
      }`}
    >
      {icon}
      {label}
      {locked && <Lock className="h-3 w-3 opacity-70" />}
    </button>
  );
}

/** Shared "upgrade to Business" modal — used by the Pro case-limit wall and the LOA/RDO locked tabs. */
function BusinessUpgradeModal({ open, onClose, message }: { open: boolean; onClose: () => void; message: string }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-[#00FF88]/30 bg-[#121A22] p-6 text-center shadow-[0_0_50px_rgba(0,255,136,0.15)]"
        onClick={(e) => e.stopPropagation()}
      >
        <Lock className="mx-auto h-8 w-8 text-[#00FF88]" />
        <h2 className="mt-3 text-base font-bold text-white">Upgrade to Business</h2>
        <p className="mt-2 text-sm text-gray-400">{message}</p>
        <a
          href="/pricing"
          className="mt-5 block w-full rounded-full bg-[#00FF88] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#22C55E]"
        >
          Upgrade to Business — ₱{BUSINESS_PRICE.toLocaleString()}/mo
        </a>
        <button type="button" onClick={onClose} className="mt-3 text-xs text-gray-500 hover:text-gray-300">
          Not now
        </button>
      </div>
    </div>
  );
}

export default function BirGuardPage() {
  const [tab, setTab] = useState<"cases" | "loa" | "rdo">("cases");
  const [plan, setPlan] = useState<Plan>("free");
  const [planLoaded, setPlanLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/billing/status", { cache: "no-store" });
        const data = await res.json();
        if (data.plan === "pro" || data.plan === "business") setPlan(data.plan);
      } finally {
        setPlanLoaded(true);
      }
    })();
  }, []);

  const isBusiness = plan === "business";

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

        <div className="flex gap-2 overflow-x-auto rounded-2xl border border-[#1E293B] bg-[#121A22] p-1.5">
          <TabButton active={tab === "cases"} onClick={() => setTab("cases")} icon={<Shield className="h-4 w-4" />} label="Cases" />
          <TabButton
            active={tab === "loa"}
            onClick={() => setTab("loa")}
            icon={<FileWarning className="h-4 w-4" />}
            label="LOA Tracker"
            locked={planLoaded && !isBusiness}
          />
          <TabButton
            active={tab === "rdo"}
            onClick={() => setTab("rdo")}
            icon={<ArrowLeftRight className="h-4 w-4" />}
            label="RDO Transfer"
            locked={planLoaded && !isBusiness}
          />
        </div>

        {tab === "cases" && <CasesTab plan={plan} planLoaded={planLoaded} />}
        {tab === "loa" && <LoaTab isBusiness={isBusiness} planLoaded={planLoaded} />}
        {tab === "rdo" && <RdoTransferTab isBusiness={isBusiness} planLoaded={planLoaded} />}
      </div>
    </div>
  );
}

function CasesTab({ plan, planLoaded }: { plan: Plan; planLoaded: boolean }) {
  const [cases, setCases] = useState<BirCase[]>([]);
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [showLimitModal, setShowLimitModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formType, setFormType] = useState(FORM_TYPES[0]);
  const [taxPeriod, setTaxPeriod] = useState("");
  const [taxDueAmount, setTaxDueAmount] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [letterCaseId, setLetterCaseId] = useState<string | null>(null);
  const [letterText, setLetterText] = useState<string | null>(null);
  const [letterLoading, setLetterLoading] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/bir-guard/cases", { cache: "no-store" });
      if (!res.ok) {
        setError("Failed to load BIR Guard cases.");
        return;
      }
      const data = await res.json();
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

  const breakdown = useMemo(() => {
    const amount = Number(taxDueAmount);
    if (!dueDate || !Number.isFinite(amount) || amount <= 0) return null;
    return calcBirPenalty(amount, dueDate);
  }, [taxDueAmount, dueDate]);

  function handleOpenAdd() {
    if (plan === "free") return; // unreachable — button is a /pricing link for free plan
    if (plan === "pro" && cases.length >= 3) {
      setShowLimitModal(true);
      return;
    }
    setIsAddOpen(true);
  }

  async function handleAddCase(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!taxPeriod.trim()) {
      setFormError("Tax period is required (e.g. Q3 2026).");
      return;
    }
    if (!dueDate) {
      setFormError("Due date is required.");
      return;
    }
    const amount = Number(taxDueAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setFormError("Tax due amount must be greater than 0.");
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
          taxDueAmount: amount,
          dueDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "CASE_LIMIT_REACHED") {
          setIsAddOpen(false);
          setShowLimitModal(true);
          return;
        }
        setFormError(data.error || "Failed to save case.");
        return;
      }
      setIsAddOpen(false);
      setTaxPeriod("");
      setTaxDueAmount("");
      setDueDate("");
      setFormType(FORM_TYPES[0]);
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
  const rowActionsDisabled = plan === "free";

  return (
    <>
      {error && (
        <div className="rounded-2xl border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">{error}</div>
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
          <div className="relative mt-2">
            <p className={`text-2xl font-bold text-white ${plan === "free" ? "select-none blur-sm" : ""}`}>
              {isLoading ? "—" : PESO(totalPenalty)}
            </p>
            {plan === "free" && (
              <Lock className="absolute inset-y-0 left-0 my-auto h-4 w-4 text-[#00FF88]" />
            )}
          </div>
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
      <Card className={`${PREMIUM_CARD} mt-6`}>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-semibold text-white">Cases</CardTitle>
          {!planLoaded ? (
            <div className="h-9 w-40 animate-pulse rounded-full bg-white/5" />
          ) : plan === "free" ? (
            <a
              href="/pricing"
              title={`Upgrade to Pro (₱${PRO_PRICE}/mo) to track up to 3 cases`}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#00FF88] px-4 py-2 text-sm font-semibold text-black transition hover:bg-[#22C55E]"
            >
              <Lock className="h-3.5 w-3.5" />
              Unlock BIR Guard — ₱{PRO_PRICE}/mo
            </a>
          ) : (
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <Button size="sm" onClick={handleOpenAdd}>
                <Plus className="h-4 w-4" />
                Add Case
              </Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add a BIR case</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddCase} className="space-y-3">
                  <p className="text-xs text-gray-500">
                    Log into <span className="text-gray-300">mytax.bir.gov.ph</span> yourself and record what you see
                    here — BIR Guard doesn&apos;t store your BIR login or check it automatically.
                  </p>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-300">BIR Form Type</label>
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
                    <label className="mb-1 block text-sm font-medium text-slate-300">Period</label>
                    <Input
                      value={taxPeriod}
                      onChange={(e) => setTaxPeriod(e.target.value)}
                      placeholder="e.g. Q3 2026"
                      className="border-[#1E293B] bg-[#0B121A]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-300">Due Date</label>
                      <Input
                        type="date"
                        value={dueDate}
                        onChange={(e) => setDueDate(e.target.value)}
                        className="border-[#1E293B] bg-[#0B121A]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-300">Tax Due Amount</label>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={taxDueAmount}
                        onChange={(e) => setTaxDueAmount(e.target.value)}
                        placeholder="0"
                        className="border-[#1E293B] bg-[#0B121A]"
                      />
                    </div>
                  </div>

                  {breakdown && (
                    <div className="rounded-xl border border-[#00FF88]/30 bg-[#0B121A] p-4 shadow-[0_0_30px_rgba(0,255,136,0.12)]">
                      <p className="text-xs font-semibold uppercase tracking-wide text-[#00FF88]">Penalty Breakdown</p>
                      <div className="mt-2 space-y-1 text-sm text-gray-300">
                        <div className="flex justify-between">
                          <span>Days Late</span>
                          <span className="font-medium text-white">{breakdown.daysLate}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Surcharge (25%)</span>
                          <span className="font-medium text-white">{PESO(breakdown.surcharge)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Interest (12%/yr)</span>
                          <span className="font-medium text-white">{PESO(breakdown.interest)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Compromise</span>
                          <span className="font-medium text-white">{PESO(breakdown.compromise)}</span>
                        </div>
                        <div className="mt-2 flex justify-between border-t border-[#1E293B] pt-2 text-base">
                          <span className="font-semibold text-white">Total</span>
                          <span className="font-bold text-[#00FF88]">{PESO(breakdown.total)}</span>
                        </div>
                      </div>
                    </div>
                  )}

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
          )}
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
              {planLoaded && plan !== "free" && (
                <Button size="sm" onClick={handleOpenAdd}>
                  <Plus className="h-4 w-4" />
                  Add a Case
                </Button>
              )}
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
                        <div
                          className={`flex flex-wrap items-center gap-1.5 ${rowActionsDisabled ? "pointer-events-none opacity-40" : ""}`}
                          title={rowActionsDisabled ? "Upgrade to PRO to manage cases" : undefined}
                        >
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
      <Card className={`${PREMIUM_CARD} mt-6`}>
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
                    className={`mt-1 h-2 w-2 shrink-0 rounded-full ${log.status === "success" ? "bg-[#00FF88]" : "bg-red-400"}`}
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

      <BusinessUpgradeModal
        open={showLimitModal}
        onClose={() => setShowLimitModal(false)}
        message="PRO is capped at 3 cases. Upgrade to Business for unlimited cases, plus LOA Tracker and RDO Transfer."
      />

      {/* Draft letter modal */}
      {letterCaseId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setLetterCaseId(null)}>
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#1E293B] bg-[#121A22] p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-white">Draft Letter</h2>
              <button type="button" onClick={() => setLetterCaseId(null)} className="text-gray-500 hover:text-gray-300" aria-label="Close">
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
    </>
  );
}

function LoaTab({ isBusiness, planLoaded }: { isBusiness: boolean; planLoaded: boolean }) {
  const [loas, setLoas] = useState<LoaCase[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [loaNo, setLoaNo] = useState("");
  const [rdo, setRdo] = useState("");
  const [receivedDate, setReceivedDate] = useState("");
  const [deadline, setDeadline] = useState("");

  const load = useCallback(async () => {
    if (!isBusiness) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch("/api/bir-guard/loa", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setLoas(data.loas ?? []);
    } finally {
      setIsLoading(false);
    }
  }, [isBusiness]);

  useEffect(() => {
    if (planLoaded) load();
  }, [planLoaded, load]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!loaNo.trim() || !rdo.trim() || !receivedDate || !deadline) {
      setFormError("All fields are required.");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch("/api/bir-guard/loa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loaNo: loaNo.trim(), rdo: rdo.trim(), receivedDate, deadline }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Failed to save LOA case.");
        return;
      }
      setIsAddOpen(false);
      setLoaNo("");
      setRdo("");
      setReceivedDate("");
      setDeadline("");
      toast("LOA case added ✅");
      await load();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleStatusChange(id: string, status: LoaCase["status"]) {
    try {
      const res = await fetch(`/api/bir-guard/loa/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        toast("Status updated ✅");
        await load();
      }
    } catch {
      toast("Network error — try again.");
    }
  }

  const content = (
    <Card className={PREMIUM_CARD}>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-semibold text-white">LOA Tracker</CardTitle>
          <span className="rounded-full bg-[#00FF88]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#00FF88]">
            Business Only
          </span>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <Button size="sm" onClick={() => setIsAddOpen(true)} disabled={!isBusiness}>
            <Plus className="h-4 w-4" />
            Add LOA
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a Letter of Authority</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">LOA No.</label>
                <Input value={loaNo} onChange={(e) => setLoaNo(e.target.value)} placeholder="e.g. LOA-044-2026-00123" className="border-[#1E293B] bg-[#0B121A]" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">RDO</label>
                <Input value={rdo} onChange={(e) => setRdo(e.target.value)} placeholder="e.g. RDO 044 - Taguig" className="border-[#1E293B] bg-[#0B121A]" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300">Received Date</label>
                  <Input type="date" value={receivedDate} onChange={(e) => setReceivedDate(e.target.value)} className="border-[#1E293B] bg-[#0B121A]" />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300">Deadline</label>
                  <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="border-[#1E293B] bg-[#0B121A]" />
                </div>
              </div>
              {formError && (
                <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">{formError}</div>
              )}
              <DialogFooter>
                <Button type="submit" disabled={isSaving} className="w-full">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {isSaving ? "Saving..." : "Save LOA"}
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
        ) : loas.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <FileWarning className="h-10 w-10 text-[#00FF88]" />
            <p className="text-sm font-semibold text-white">No LOAs on file.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1E293B] text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="pb-2 pr-4">LOA No.</th>
                  <th className="pb-2 pr-4">RDO</th>
                  <th className="pb-2 pr-4">Received Date</th>
                  <th className="pb-2 pr-4">Deadline</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {loas.map((l) => {
                  const daysLeft = Math.ceil((new Date(l.deadline).getTime() - Date.now()) / 86_400_000);
                  const urgent = l.status !== "closed" && daysLeft < 3;
                  return (
                    <tr key={l.id} className="border-b border-[#1E293B]/60 last:border-0">
                      <td className="py-3 pr-4 font-medium text-white">{l.loa_no}</td>
                      <td className="py-3 pr-4 text-gray-300">{l.rdo}</td>
                      <td className="py-3 pr-4 text-gray-300">{new Date(l.received_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}</td>
                      <td className={`py-3 pr-4 font-medium ${urgent ? "text-red-400" : "text-gray-300"}`}>
                        {new Date(l.deadline).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                        {l.status !== "closed" && (
                          <span className="ml-2 text-xs">{daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}</span>
                        )}
                      </td>
                      <td className="py-3">
                        <select
                          value={l.status}
                          onChange={(e) => handleStatusChange(l.id, e.target.value as LoaCase["status"])}
                          className="h-8 rounded-lg border border-[#1E293B] bg-[#0B121A] px-2 text-xs text-slate-100"
                        >
                          <option value="open">Open</option>
                          <option value="submitted">Submitted</option>
                          <option value="closed">Closed</option>
                        </select>
                        <span className="ml-2">{loaStatusBadge(l.status)}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (!planLoaded) return content;
  if (isBusiness) return content;

  return (
    <div className="relative">
      <div className="pointer-events-none select-none space-y-4 blur-sm">{content}</div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[#080F14]/60 p-6 text-center">
        <Lock className="h-8 w-8 text-[#00FF88]" />
        <p className="text-lg font-bold text-white">BUSINESS ONLY</p>
        <p className="max-w-sm text-sm text-gray-400">
          Track every Letter of Authority and its deadline in one place. Upgrade to Business to unlock.
        </p>
        <a
          href="/pricing"
          className="mt-1 rounded-full bg-[#00FF88] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#22C55E]"
        >
          Upgrade to Business — ₱{BUSINESS_PRICE.toLocaleString()}/mo
        </a>
      </div>
    </div>
  );
}

function RdoTransferTab({ isBusiness, planLoaded }: { isBusiness: boolean; planLoaded: boolean }) {
  const [fromRdo, setFromRdo] = useState(""); // formatted "044 - Taguig-Pateros" — see RdoPicker
  const [toRdo, setToRdo] = useState("");
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!planLoaded) return;
    if (!isBusiness) {
      setIsLoading(false);
      return;
    }
    (async () => {
      try {
        const res = await fetch("/api/bir-guard/rdo-transfer", { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          const t = data.transfer;
          setFromRdo(t?.from_rdo_code ? formatRdoValue({ code: t.from_rdo_code, name: t.from_rdo_name }) : "");
          setToRdo(t?.to_rdo_code ? formatRdoValue({ code: t.to_rdo_code, name: t.to_rdo_name }) : "");
          setChecklist(t?.checklist ?? {});
        }
      } finally {
        setIsLoading(false);
      }
    })();
  }, [planLoaded, isBusiness]);

  async function handleSave() {
    setIsSaving(true);
    try {
      const res = await fetch("/api/bir-guard/rdo-transfer", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromRdoCode: parseRdoValue(fromRdo)?.code ?? "",
          toRdoCode: parseRdoValue(toRdo)?.code ?? "",
          checklist,
        }),
      });
      if (res.ok) toast("Progress saved ✅");
      else toast("Failed to save — try again.");
    } catch {
      toast("Network error — try again.");
    } finally {
      setIsSaving(false);
    }
  }

  const doneCount = RDO_CHECKLIST_ITEMS.filter((item) => checklist[item.id]).length;

  const content = (
    <Card className={PREMIUM_CARD}>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-semibold text-white">RDO Transfer</CardTitle>
          <span className="rounded-full bg-[#00FF88]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#00FF88]">
            Business Only
          </span>
        </div>
        <span className="text-xs text-gray-500">
          {doneCount}/{RDO_CHECKLIST_ITEMS.length} checklist items
        </span>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 w-full animate-pulse rounded-lg bg-white/5" />
            ))}
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">From RDO</label>
                <RdoPicker value={fromRdo} onChange={setFromRdo} placeholder="Select current RDO" disabled={!isBusiness} />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">To RDO</label>
                <RdoPicker value={toRdo} onChange={setToRdo} placeholder="Select new RDO" disabled={!isBusiness} />
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium text-slate-300">1905 Checklist</p>
              <div className="space-y-2">
                {RDO_CHECKLIST_ITEMS.map((item) => (
                  <label key={item.id} className="flex items-center gap-2.5 rounded-lg border border-[#1E293B] bg-[#0B121A] px-3 py-2.5 text-sm text-gray-300">
                    <input
                      type="checkbox"
                      checked={Boolean(checklist[item.id])}
                      disabled={!isBusiness}
                      onChange={(e) => setChecklist((prev) => ({ ...prev, [item.id]: e.target.checked }))}
                      className="h-4 w-4 rounded border-[#1E293B] bg-[#0B121A] text-[#00FF88] accent-[#00FF88]"
                    />
                    {item.label}
                  </label>
                ))}
              </div>
            </div>

            <Button onClick={handleSave} disabled={isSaving || !isBusiness} className="w-full">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isSaving ? "Saving..." : "Save Progress"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );

  if (!planLoaded) return content;
  if (isBusiness) return content;

  return (
    <div className="relative">
      <div className="pointer-events-none select-none space-y-4 blur-sm">{content}</div>
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[#080F14]/60 p-6 text-center">
        <Lock className="h-8 w-8 text-[#00FF88]" />
        <p className="text-lg font-bold text-white">BUSINESS ONLY</p>
        <p className="max-w-sm text-sm text-gray-400">
          Plan your RDO transfer with a guided 1905 checklist. Upgrade to Business to unlock.
        </p>
        <a
          href="/pricing"
          className="mt-1 rounded-full bg-[#00FF88] px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-[#22C55E]"
        >
          Upgrade to Business — ₱{BUSINESS_PRICE.toLocaleString()}/mo
        </a>
      </div>
    </div>
  );
}
