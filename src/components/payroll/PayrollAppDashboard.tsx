"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users,
  Plus,
  Loader2,
  Clock,
  Wallet,
  AlertTriangle,
  FileText,
  LogOut,
  CheckCircle2,
  Camera,
  X,
  Lock,
  Mic,
  Sparkles,
  Download,
  Send,
  Building2,
  CalendarClock,
  ShieldCheck,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PayrollCheckoutModal } from "@/app/payroll/app/components/PayrollCheckoutModal";
import {
  PAYROLL_PLAN_LABELS,
  PAYROLL_STAFF_LIMITS,
  DEFAULT_DAILY_RATE,
  FREE_ATTENDANCE_LIMIT,
  tierOf,
  type PayrollPlan,
  type PayrollTier,
} from "@/lib/payroll/pricing";
import { PAYROLL_PROMO } from "@/lib/payroll/promo";
import { DOLE_MIN_DAILY_WAGE, estimateWithholdingTax, computeBasicPay, type PayrollBreakdownRow } from "@/lib/payroll/sahod";

const PREMIUM_CARD =
  "rounded-2xl border-[#1E293B] bg-[#121A22] shadow-sm transition hover:border-[#00FF88]/30 hover:shadow-lg hover:shadow-green-500/10";
const PESO = (n: number) => `₱${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

interface Staff {
  id: string;
  name: string;
  gcash: string | null;
  daily_rate: number;
  created_at: string;
}

interface AttendanceRow {
  id: string;
  staff_id: string;
  date: string;
  time_in: string | null;
  time_out: string | null;
  payroll_staff: { name: string };
}

interface PayrollRun {
  id: string;
  month: string;
  total_sahod: number;
  status: "draft" | "finalized";
  breakdown: PayrollBreakdownRow[];
  created_at: string;
}

interface Company {
  owner_id: string;
  business_name: string;
  rdo_code: string | null;
  min_wage: number;
  tin: string | null;
  created_at: string;
}

type Tab = "staff" | "timekeeping" | "run" | "payslip" | "reports";

function toast(message: string) {
  const el = document.createElement("div");
  el.textContent = message;
  el.className =
    "fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-full border border-[#00FF88]/30 bg-[#121A22] px-4 py-2 text-sm font-medium text-[#00FF88] shadow-lg shadow-black/40";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

function currentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

/** Next payday — the 15th if we haven't reached it this month, otherwise the last day of the month, rolling to next month's 15th once we're past that. */
function nextPayday(now = new Date()): Date {
  const fifteenth = new Date(now.getFullYear(), now.getMonth(), 15);
  if (now <= fifteenth) return fifteenth;
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  if (now <= lastDay) return lastDay;
  return new Date(now.getFullYear(), now.getMonth() + 1, 15);
}

/** BIR 1601C is due the 10th of the month following the compensation month. */
function daysUntilBirDue(now = new Date()): number {
  const dueThisMonth = new Date(now.getFullYear(), now.getMonth(), 10);
  const due = now <= dueThisMonth ? dueThisMonth : new Date(now.getFullYear(), now.getMonth() + 1, 10);
  return Math.ceil((due.getTime() - now.getTime()) / 86_400_000);
}

function BlurValue({ locked, children }: { locked: boolean; children: React.ReactNode }) {
  if (!locked) return <>{children}</>;
  return (
    <span className="relative inline-flex items-center">
      <span className="select-none blur-sm">{children}</span>
      <Lock className="absolute inset-0 m-auto h-3.5 w-3.5 text-[#00FF88]" />
    </span>
  );
}

export function PayrollAppDashboard({
  businessName,
  plan,
  autoOpenCheckoutPlan,
}: {
  businessName: string;
  plan: PayrollPlan | null;
  autoOpenCheckoutPlan?: PayrollPlan;
}) {
  const router = useRouter();
  const [currentPlan, setCurrentPlan] = useState<PayrollPlan | null>(plan);
  const tier: PayrollTier = tierOf(currentPlan);
  const isFree = tier === "free";
  const isBusinessPlus = tier === "business" || tier === "enterprise";

  const [company, setCompany] = useState<Company | null>(null);
  const [companyPrefillName, setCompanyPrefillName] = useState(businessName);
  const [showCompanySetup, setShowCompanySetup] = useState(false);

  const [staff, setStaff] = useState<Staff[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [tab, setTab] = useState<Tab>("staff");

  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState<PayrollPlan | undefined>(undefined);

  const openCheckout = useCallback((preselect?: PayrollPlan) => {
    setCheckoutPlan(preselect);
    setCheckoutOpen(true);
  }, []);

  const loadCompany = useCallback(async () => {
    try {
      const res = await fetch("/api/payroll/company", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setCompany(data.company);
        if (data.prefill?.businessName) setCompanyPrefillName((prev) => prev || data.prefill.businessName);
        if (!data.company) setShowCompanySetup(true);
      }
    } catch {
      // best-effort — the setup modal will still let them create one manually
    }
  }, []);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [staffRes, attRes, runsRes] = await Promise.all([
        fetch("/api/payroll/staff", { cache: "no-store" }),
        fetch(`/api/payroll/attendance?month=${currentMonthKey()}`, { cache: "no-store" }),
        fetch("/api/payroll/runs", { cache: "no-store" }),
      ]);
      if (staffRes.ok) setStaff((await staffRes.json()).staff ?? []);
      if (attRes.ok) setAttendance((await attRes.json()).attendance ?? []);
      if (runsRes.ok) setRuns((await runsRes.json()).runs ?? []);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCompany();
    loadData();
  }, [loadCompany, loadData]);

  useEffect(() => {
    if (autoOpenCheckoutPlan) openCheckout(autoOpenCheckoutPlan);
  }, [autoOpenCheckoutPlan, openCheckout]);

  function handleCheckoutSuccess(newPlan: PayrollPlan) {
    setCurrentPlan(newPlan);
    setCheckoutOpen(false);
    toast(`Unlocked ${PAYROLL_PLAN_LABELS[newPlan]}! 🎉`);
    loadData();
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  const minWage = company?.min_wage ?? DOLE_MIN_DAILY_WAGE;
  const doleWarnings = useMemo(() => staff.filter((s) => Number(s.daily_rate) < minWage), [staff, minWage]);
  const latestRun = runs[0];
  const daysLeftPromo = Math.max(0, Math.ceil((PAYROLL_PROMO.endDate.getTime() - Date.now()) / 86_400_000));

  return (
    <div className="min-h-screen bg-[#080F14] text-white">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-[#001A29]/95 px-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-white">
            Axla <span className="text-[#00FF88]">Payroll</span>
          </span>
          {company && <span className="hidden text-sm text-slate-400 sm:inline">— {company.business_name}</span>}
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
              isFree ? "bg-white/10 text-slate-300" : "bg-[#00FF88]/15 text-[#00FF88]"
            }`}
          >
            {isFree ? "Free" : PAYROLL_PLAN_LABELS[currentPlan!]}
          </span>
          {isFree && (
            <button
              type="button"
              onClick={() => openCheckout()}
              className="rounded-full bg-[#00FF88] px-3.5 py-1.5 text-xs font-semibold text-black transition hover:bg-[#22C55E]"
            >
              Upgrade
            </button>
          )}
          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs font-medium text-slate-300 transition hover:border-red-500/40 hover:bg-red-500/10 hover:text-red-300"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </header>

      {daysLeftPromo > 0 && (
        <div className="bg-[#00FF88] px-3 py-2 text-center text-xs font-bold text-black sm:text-sm">
          🎉 50% OFF — {daysLeftPromo}d left until Aug 31, 2026
        </div>
      )}

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {/* AI Command Bar — mock */}
        <div className="relative">
          <Sparkles className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#00FF88]" />
          <input
            type="text"
            placeholder="Axla, run payroll for June..."
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                toast("Coming soon! 🤖 AI commands are in development.");
              }
            }}
            className="h-12 w-full rounded-2xl border border-[#00FF88]/20 bg-[#0B121A] pl-11 pr-11 text-sm text-white placeholder-slate-500 focus:border-[#00FF88] focus:outline-none"
          />
          <Mic className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        </div>

        {/* Overview KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <div className={`${PREMIUM_CARD} p-5`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-400">Total Active Staff</p>
              <Users className="h-4 w-4 text-[#00FF88]" />
            </div>
            <p className="mt-2 text-2xl font-bold text-white">{isLoading ? "—" : staff.length}</p>
          </div>
          <div className={`${PREMIUM_CARD} p-5`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-400">This Month Payroll</p>
              <Wallet className="h-4 w-4 text-[#00FF88]" />
            </div>
            <p className="mt-2 text-2xl font-bold text-white">
              <BlurValue locked={isFree}>{isLoading ? "—" : latestRun ? PESO(latestRun.total_sahod) : "₱0"}</BlurValue>
            </p>
          </div>
          <div className={`${PREMIUM_CARD} p-5`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-400">Next Payday</p>
              <CalendarClock className="h-4 w-4 text-[#00FF88]" />
            </div>
            <p className="mt-2 text-lg font-bold text-white">
              <BlurValue locked={isFree}>{nextPayday().toLocaleDateString("en-PH", { month: "short", day: "numeric" })}</BlurValue>
            </p>
          </div>
          <div className={`${PREMIUM_CARD} p-5`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-400">DOLE Compliance</p>
              <ShieldCheck className="h-4 w-4 text-[#00FF88]" />
            </div>
            <p className="mt-2 text-lg font-bold text-white">
              <BlurValue locked={isFree}>{doleWarnings.length === 0 ? "Compliant" : `${doleWarnings.length} Below Wage`}</BlurValue>
            </p>
          </div>
          <div className={`${PREMIUM_CARD} p-5`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-400">BIR 1601C Due</p>
              <FileText className="h-4 w-4 text-[#00FF88]" />
            </div>
            <p className="mt-2 text-lg font-bold text-white">
              <BlurValue locked={isFree}>{daysUntilBirDue()}d</BlurValue>
            </p>
          </div>
        </div>

        {doleWarnings.length > 0 && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <p className="text-sm font-semibold text-red-300">
                DOLE Warning: {doleWarnings.length} staff below minimum wage ₱{minWage} — {doleWarnings.map((s) => s.name).join(", ")}.
              </p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto rounded-2xl border border-[#1E293B] bg-[#121A22] p-1.5">
          {(
            [
              { id: "staff", label: "Staff" },
              { id: "timekeeping", label: "Timekeeping" },
              { id: "run", label: "Payroll Run" },
              { id: "payslip", label: "Payslip & BIR" },
              { id: "reports", label: "Reports" },
            ] as { id: Tab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                tab === t.id ? "bg-[#00FF88] text-black" : "text-gray-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "staff" && (
          <StaffTab staff={staff} isLoading={isLoading} tier={tier} onChanged={loadData} onUpgrade={openCheckout} />
        )}
        {tab === "timekeeping" && (
          <TimekeepingTab
            staff={staff}
            attendance={attendance}
            isLoading={isLoading}
            tier={tier}
            onChanged={loadData}
            onUpgrade={openCheckout}
          />
        )}
        {tab === "run" && (
          <PayrollRunTab staff={staff} runs={runs} isLoading={isLoading} tier={tier} onChanged={loadData} onUpgrade={openCheckout} />
        )}
        {tab === "payslip" && (
          <PayslipBirTab company={company} latestRun={latestRun} tier={tier} isBusinessPlus={isBusinessPlus} onUpgrade={openCheckout} />
        )}
        {tab === "reports" && <ReportsTab runs={runs} tier={tier} onUpgrade={openCheckout} />}
      </div>

      {showCompanySetup && (
        <CompanySetupModal
          prefillName={companyPrefillName}
          onClose={() => setShowCompanySetup(false)}
          onSaved={(c) => {
            setCompany(c);
            setShowCompanySetup(false);
            toast("Company setup complete ✅");
          }}
        />
      )}

      {!showCompanySetup && !company && (
        <button
          type="button"
          onClick={() => setShowCompanySetup(true)}
          className="fixed bottom-6 right-6 z-40 flex items-center gap-2 rounded-full bg-[#00FF88] px-4 py-3 text-sm font-semibold text-black shadow-lg shadow-[#00FF88]/30 transition hover:bg-[#22C55E]"
        >
          <Building2 className="h-4 w-4" />
          Complete company setup
        </button>
      )}

      <PayrollCheckoutModal
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        preselectedPlan={checkoutPlan}
        onSuccess={handleCheckoutSuccess}
      />
    </div>
  );
}

function CompanySetupModal({
  prefillName,
  onClose,
  onSaved,
}: {
  prefillName: string;
  onClose: () => void;
  onSaved: (company: Company) => void;
}) {
  const [businessName, setBusinessName] = useState(prefillName);
  const [rdoCode, setRdoCode] = useState("Batangas ₱479");
  const [tin, setTin] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setBusinessName(prefillName), [prefillName]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!businessName.trim()) {
      setError("Business name is required.");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch("/api/payroll/company", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName: businessName.trim(), rdoCode: rdoCode.trim(), tin: tin.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save company.");
        return;
      }
      onSaved(data.company);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#00FF88]/30 bg-[#121A22] p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Setup your company — 1 click!</h2>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-300" aria-label="Skip for now">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">Free — takes 10 seconds. You can edit this anytime.</p>
        <form onSubmit={handleSave} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Business Name</label>
            <Input value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Double R Water" className="border-[#1E293B] bg-[#0B121A]" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">RDO / Region</label>
            <Input value={rdoCode} onChange={(e) => setRdoCode(e.target.value)} className="border-[#1E293B] bg-[#0B121A]" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">TIN (optional)</label>
            <Input value={tin} onChange={(e) => setTin(e.target.value)} placeholder="123-456-789-000" className="border-[#1E293B] bg-[#0B121A]" />
          </div>
          {error && <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">{error}</div>}
          <Button type="submit" disabled={isSaving} className="w-full">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isSaving ? "Saving..." : "Save & Continue — Free"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function StaffTab({
  staff,
  isLoading,
  tier,
  onChanged,
  onUpgrade,
}: {
  staff: Staff[];
  isLoading: boolean;
  tier: PayrollTier;
  onChanged: () => void;
  onUpgrade: (plan?: PayrollPlan) => void;
}) {
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [gcash, setGcash] = useState("");
  const [rate, setRate] = useState(String(DEFAULT_DAILY_RATE));

  const limit = PAYROLL_STAFF_LIMITS[tier];

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!name.trim()) {
      setFormError("Staff name is required.");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch("/api/payroll/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), gcash: gcash.trim(), dailyRate: Number(rate) }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "STAFF_LIMIT_REACHED") {
          setIsAddOpen(false);
          onUpgrade(tier === "free" ? "starter" : undefined);
          return;
        }
        setFormError(data.error || "Failed to add staff.");
        return;
      }
      setIsAddOpen(false);
      setName("");
      setGcash("");
      setRate(String(DEFAULT_DAILY_RATE));
      toast("Staff added ✅");
      onChanged();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemove(id: string) {
    try {
      const res = await fetch(`/api/payroll/staff/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast("Staff removed");
        onChanged();
      }
    } catch {
      toast("Network error — try again.");
    }
  }

  const atLimit = limit !== null && staff.length >= limit;

  return (
    <Card className={PREMIUM_CARD}>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-semibold text-white">Staff</CardTitle>
          <span className="text-xs text-gray-500">
            {staff.length}/{limit ?? "∞"}
          </span>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <Button size="sm" onClick={() => (atLimit ? onUpgrade(tier === "free" ? "starter" : undefined) : setIsAddOpen(true))}>
            <Plus className="h-4 w-4" />
            Add Staff
          </Button>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Staff</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Name</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Juan Dela Cruz" className="border-[#1E293B] bg-[#0B121A]" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">GCash Number</label>
                <Input value={gcash} onChange={(e) => setGcash(e.target.value)} placeholder="09171234567" className="border-[#1E293B] bg-[#0B121A]" />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Daily Rate</label>
                <Input type="number" min="0" step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} className="border-[#1E293B] bg-[#0B121A]" />
                <p className="mt-1 text-xs text-gray-500">Auto-suggested ₱{DEFAULT_DAILY_RATE} (Batangas reference minimum wage).</p>
              </div>
              {formError && <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">{formError}</div>}
              <DialogFooter>
                <Button type="submit" disabled={isSaving} className="w-full">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {isSaving ? "Saving..." : "Save Staff"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-white/5" />
            ))}
          </div>
        ) : staff.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <Users className="h-10 w-10 text-[#00FF88]" />
            <p className="text-sm font-semibold text-white">Wala pang staff. Add mo na — libre ang una!</p>
            <Button size="sm" onClick={() => setIsAddOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Staff
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1E293B] text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4">GCash</th>
                  <th className="pb-2 pr-4">Daily Rate</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.id} className="border-b border-[#1E293B]/60 last:border-0">
                    <td className="py-3 pr-4 font-medium text-white">{s.name}</td>
                    <td className="py-3 pr-4 text-gray-300">{s.gcash || "—"}</td>
                    <td className={`py-3 pr-4 ${Number(s.daily_rate) < DOLE_MIN_DAILY_WAGE ? "text-amber-400" : "text-gray-300"}`}>
                      {PESO(s.daily_rate)}
                    </td>
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={() => handleRemove(s.id)}
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-red-900/40 px-2 text-xs text-red-300 hover:bg-red-950/30"
                      >
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {tier === "free" && (
          <p className="mt-3 text-xs text-gray-500">Free plan: 1 staff. Upgrade to Starter ₱149/mo for up to 5.</p>
        )}
      </CardContent>
    </Card>
  );
}

function TimekeepingTab({
  staff,
  attendance,
  isLoading,
  tier,
  onChanged,
  onUpgrade,
}: {
  staff: Staff[];
  attendance: AttendanceRow[];
  isLoading: boolean;
  tier: PayrollTier;
  onChanged: () => void;
  onUpgrade: (plan?: PayrollPlan) => void;
}) {
  const [clockingId, setClockingId] = useState<string | null>(null);
  const todayIso = new Date().toISOString().slice(0, 10);
  const todaysByStaff = useMemo(() => {
    const map = new Map<string, AttendanceRow>();
    for (const row of attendance) if (row.date === todayIso) map.set(row.staff_id, row);
    return map;
  }, [attendance, todayIso]);

  async function handleClock(staffId: string, action: "in" | "out") {
    setClockingId(staffId);
    try {
      const res = await fetch("/api/payroll/attendance/clock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ staffId, action }),
      });
      if (res.ok) {
        toast(action === "in" ? "Timed in ✅" : "Timed out ✅");
        onChanged();
      } else {
        const data = await res.json();
        if (data.code === "ATTENDANCE_LIMIT_REACHED") {
          onUpgrade("starter");
          return;
        }
        toast(data.error || "Failed to record attendance.");
      }
    } catch {
      toast("Network error — try again.");
    } finally {
      setClockingId(null);
    }
  }

  return (
    <Card className={PREMIUM_CARD}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-white">Timekeeping — Today</CardTitle>
          {tier === "business" || tier === "enterprise" ? (
            <span className="rounded-full bg-[#00FF88]/15 px-2 py-0.5 text-[10px] font-bold uppercase text-[#00FF88]">AI Selfie Ready</span>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {isBusinessPlusSelfieHint(tier)}
        {isLoading ? (
          <div className="h-12 w-full animate-pulse rounded-lg bg-white/5" />
        ) : staff.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">Add a staff member first.</p>
        ) : (
          <div className="space-y-2">
            {staff.map((s) => {
              const today = todaysByStaff.get(s.id);
              const isClocking = clockingId === s.id;
              return (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[#1E293B] bg-[#0B121A] px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{s.name}</p>
                    <p className="text-xs text-gray-500">
                      {today?.time_in ? `In: ${new Date(today.time_in).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}` : "Not timed in"}
                      {today?.time_out ? ` · Out: ${new Date(today.time_out).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={isClocking || Boolean(today?.time_in)}
                      onClick={() => handleClock(s.id, "in")}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#00FF88]/30 px-2.5 text-xs text-[#00FF88] hover:bg-[#00FF88]/10 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Clock className="h-3.5 w-3.5" />
                      Time In
                    </button>
                    <button
                      type="button"
                      disabled={isClocking || !today?.time_in || Boolean(today?.time_out)}
                      onClick={() => handleClock(s.id, "out")}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#1E293B] px-2.5 text-xs text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isClocking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Camera className="h-3.5 w-3.5" />}
                      Time Out
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-xs text-gray-500">
          <Camera className="mr-1 inline h-3 w-3" />
          Selfie capture is a placeholder in this phase — timekeeping records the timestamp only.
        </p>
        {tier === "free" && (
          <p className="mt-1 text-xs text-gray-500">Free plan: {FREE_ATTENDANCE_LIMIT} manual entry. Upgrade to Starter ₱149/mo for real timekeeping.</p>
        )}
      </CardContent>
    </Card>
  );
}

function isBusinessPlusSelfieHint(tier: PayrollTier) {
  if (tier !== "business" && tier !== "enterprise") return null;
  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-[#00FF88]/20 bg-[#00FF88]/[0.04] px-3 py-2 text-xs text-[#00FF88]">
      <Camera className="h-3.5 w-3.5" />
      AI Selfie Timekeeping is enabled on your plan — camera capture UI coming soon, manual entry works today.
    </div>
  );
}

function PayrollRunTab({
  staff,
  runs,
  isLoading,
  tier,
  onChanged,
  onUpgrade,
}: {
  staff: Staff[];
  runs: PayrollRun[];
  isLoading: boolean;
  tier: PayrollTier;
  onChanged: () => void;
  onUpgrade: (plan?: PayrollPlan) => void;
}) {
  const [isComputing, setIsComputing] = useState(false);
  const isFree = tier === "free";

  async function handleCompute() {
    if (isFree) {
      onUpgrade("starter");
      return;
    }
    setIsComputing(true);
    try {
      const res = await fetch("/api/payroll/runs/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: currentMonthKey() }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "NO_SUBSCRIPTION") {
          onUpgrade("starter");
          return;
        }
        toast(data.error || "Failed to compute sahod.");
        return;
      }
      toast("Sahod computed ✅");
      onChanged();
    } catch {
      toast("Network error — try again.");
    } finally {
      setIsComputing(false);
    }
  }

  return (
    <Card className={PREMIUM_CARD}>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold text-white">Payroll Run — {currentMonthKey()}</CardTitle>
        <Button size="sm" onClick={handleCompute} disabled={isComputing || staff.length === 0} variant={isFree ? "outline" : "default"}>
          {isComputing ? <Loader2 className="h-4 w-4 animate-spin" /> : isFree ? <Lock className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
          {isComputing ? "Computing..." : isFree ? "Unlock for ₱149" : "Compute Sahod"}
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-12 w-full animate-pulse rounded-lg bg-white/5" />
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Wallet className="h-10 w-10 text-[#00FF88]" />
            <p className="text-sm font-semibold text-white">Run your first payroll — Unlock Business</p>
            {isFree && (
              <Button size="sm" onClick={() => onUpgrade()} className="mt-2">
                Upgrade Now
              </Button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1E293B] text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="pb-2 pr-4">Month</th>
                  <th className="pb-2 pr-4">Total Sahod</th>
                  <th className="pb-2 pr-4">Staff</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-[#1E293B]/60 last:border-0">
                    <td className="py-3 pr-4 font-medium text-white">{r.month}</td>
                    <td className="py-3 pr-4 text-gray-300">{PESO(r.total_sahod)}</td>
                    <td className="py-3 pr-4 text-gray-300">{r.breakdown?.length ?? 0}</td>
                    <td className="py-3">
                      <Badge variant="success">{r.status === "finalized" ? "Finalized" : "Draft"}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PayslipBirTab({
  company,
  latestRun,
  tier,
  isBusinessPlus,
  onUpgrade,
}: {
  company: Company | null;
  latestRun: PayrollRun | undefined;
  tier: PayrollTier;
  isBusinessPlus: boolean;
  onUpgrade: (plan?: PayrollPlan) => void;
}) {
  const isFree = tier === "free";
  const totalWithholding = latestRun ? estimateWithholdingTax(latestRun.total_sahod) : 0;

  async function handleDownload(row: PayrollBreakdownRow) {
    const { generatePayslipPdf } = await import("@/lib/payroll/payslip-pdf");
    generatePayslipPdf({
      businessName: company?.business_name ?? "Your Business",
      staffName: row.name,
      dailyRate: row.dailyRate,
      daysPresent: row.daysPresent,
      basicPay: row.basicPay,
      gcash: null,
      demo: isFree,
    });
  }

  return (
    <div className="space-y-4">
      <Card className={PREMIUM_CARD}>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-white">GCash Payslip</CardTitle>
        </CardHeader>
        <CardContent>
          {!latestRun ? (
            <p className="py-8 text-center text-sm text-gray-500">
              {isFree ? "Demo preview only — compute a payroll run to generate real payslips." : "Compute a payroll run first."}
            </p>
          ) : (
            <div className="space-y-2">
              {latestRun.breakdown.map((row) => (
                <div key={row.staffId} className="relative overflow-hidden rounded-xl border border-[#1E293B] bg-[#0B121A] p-4">
                  {isFree && (
                    <span className="pointer-events-none absolute right-3 top-3 rotate-12 rounded border border-red-500/50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest text-red-400">
                      Demo
                    </span>
                  )}
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">{row.name}</p>
                    <CheckCircle2 className="h-4 w-4 text-[#00FF88]" />
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-gray-400">
                    <div className="flex justify-between">
                      <span>Basic</span>
                      <span className="text-gray-200">{PESO(row.basicPay)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>OT</span>
                      <span className="text-gray-200">₱0</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Deductions</span>
                      <span className="text-gray-200">₱0</span>
                    </div>
                    <div className="flex justify-between border-t border-[#1E293B] pt-1.5 text-sm">
                      <span className="font-semibold text-white">Net Pay</span>
                      <span className="font-bold text-[#00FF88]">{PESO(row.basicPay)}</span>
                    </div>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleDownload(row)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#1E293B] px-3 text-xs text-slate-200 hover:bg-white/5"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download PDF
                    </button>
                    {isBusinessPlus && (
                      <button
                        type="button"
                        onClick={() => toast("Payslip sent via GCash (mock) ✅")}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#00FF88]/30 px-3 text-xs text-[#00FF88] hover:bg-[#00FF88]/10"
                      >
                        <Send className="h-3.5 w-3.5" />
                        Send 1-click
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className={PREMIUM_CARD}>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-white">BIR 1601C / 2316</CardTitle>
        </CardHeader>
        <CardContent>
          {isBusinessPlus ? (
            <div className="space-y-1 text-sm text-gray-300">
              <div className="flex justify-between">
                <span>Total Compensation</span>
                <span className="font-medium text-white">{latestRun ? PESO(latestRun.total_sahod) : "₱0"}</span>
              </div>
              <div className="flex justify-between">
                <span>Estimated Withholding Tax</span>
                <span className="font-medium text-white">{PESO(totalWithholding)}</span>
              </div>
              <p className="mt-2 text-[11px] text-gray-500">Illustrative estimate only — verify against the BIR withholding table.</p>
            </div>
          ) : (
            <div className="relative">
              <div className="pointer-events-none select-none space-y-1 text-sm text-gray-300 blur-sm">
                <div className="flex justify-between">
                  <span>Total Compensation</span>
                  <span className="font-medium text-white">₱25,000</span>
                </div>
                <div className="flex justify-between">
                  <span>Estimated Withholding Tax</span>
                  <span className="font-medium text-white">₱750</span>
                </div>
              </div>
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
                <Lock className="h-5 w-5 text-[#00FF88]" />
                <p className="text-sm font-semibold text-white">Available on Business plan</p>
                <button
                  type="button"
                  onClick={() => onUpgrade("business")}
                  className="rounded-full bg-[#00FF88] px-4 py-1.5 text-xs font-semibold text-black hover:bg-[#22C55E]"
                >
                  Upgrade to Business ₱299/mo
                </button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ReportsTab({ runs, tier, onUpgrade }: { runs: PayrollRun[]; tier: PayrollTier; onUpgrade: (plan?: PayrollPlan) => void }) {
  const currentYear = new Date().getFullYear();
  const ytdTotal = runs.filter((r) => r.month.startsWith(String(currentYear))).reduce((sum, r) => sum + Number(r.total_sahod), 0);
  const thirteenthMonthAccrual = ytdTotal / 12;

  return (
    <Card className={PREMIUM_CARD}>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-white">Reports</CardTitle>
      </CardHeader>
      <CardContent>
        {runs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <FileText className="h-10 w-10 text-[#00FF88]" />
            <p className="text-sm font-semibold text-white">No payroll history yet.</p>
            {tier === "free" && (
              <Button size="sm" onClick={() => onUpgrade()} className="mt-2">
                Upgrade to Unlock
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-[#1E293B] bg-[#0B121A] p-4">
                <p className="text-xs text-gray-500">YTD Payroll ({currentYear})</p>
                <p className="mt-1 text-xl font-bold text-white">{PESO(ytdTotal)}</p>
              </div>
              <div className="rounded-xl border border-[#1E293B] bg-[#0B121A] p-4">
                <p className="text-xs text-gray-500">13th Month Accrual (YTD ÷ 12)</p>
                <p className="mt-1 text-xl font-bold text-[#00FF88]">{PESO(thirteenthMonthAccrual)}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1E293B] text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="pb-2 pr-4">Month</th>
                    <th className="pb-2">Total Sahod</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <tr key={r.id} className="border-b border-[#1E293B]/60 last:border-0">
                      <td className="py-2 pr-4 text-white">{r.month}</td>
                      <td className="py-2 text-gray-300">{PESO(r.total_sahod)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
