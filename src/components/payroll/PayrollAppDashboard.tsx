"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  MapPin,
  Copy,
  QrCode,
  Check,
  XCircle,
  RefreshCw,
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
import {
  DOLE_MIN_DAILY_WAGE,
  estimateWithholdingTax,
  getCutOffRange,
  CUTOFF_LABELS,
  DEFAULT_DAYS_BY_CUTOFF,
  type CutOff,
  type PayrollBreakdownRow,
} from "@/lib/payroll/sahod";
import { getPaymentProof, UNPAID_PROOF, type PaymentProof, type PaymentProofStatus } from "@/lib/payroll/payment-proof";

const CLOCK_LINK_ORIGIN = "https://axla.space";

const PREMIUM_CARD =
  "rounded-2xl border-[#1E293B] bg-[#121A22] shadow-sm transition hover:border-[#00FF88]/30 hover:shadow-lg hover:shadow-green-500/10";
const PESO = (n: number) => `₱${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function maskGcash(g: string | null): string {
  if (!g) return "—";
  const digits = g.replace(/\D/g, "");
  if (digits.length < 8) return g;
  return `${digits.slice(0, 4)}****${digits.slice(-4)}`;
}

function clockLinkFor(token: string | null): string | null {
  return token ? `${CLOCK_LINK_ORIGIN}/c/${token}` : null;
}

interface Staff {
  id: string;
  name: string;
  gcash: string | null;
  daily_rate: number;
  clock_token: string | null;
  created_at: string;
}

interface TimekeepingLog {
  id: string;
  staff_id: string;
  staff_name: string;
  type: "in" | "out";
  lat: number | null;
  lng: number | null;
  distance_meters: number | null;
  is_outside: boolean;
  daily_code_match: boolean;
  needs_approval: boolean;
  approved: boolean | null;
  selfie_url: string | null;
  created_at: string;
  /** Comma-joined codes, e.g. "IMPOSSIBLE_TRAVEL,MOCK_LOCATION" — see src/lib/payroll/anti-cheat.ts. Null when no anti-cheat signal fired. */
  flag: string | null;
  flag_note: string | null;
  buddy_punch_flagged: boolean;
}

interface ShopSettings {
  owner_id: string;
  shop_name: string;
  lat: number | null;
  lng: number | null;
  radius_meters: number;
  daily_code: string | null;
  daily_code_date: string | null;
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
  cut_off?: CutOff | null;
  total_sahod: number;
  status: "draft" | "finalized";
  breakdown: PayrollBreakdownRow[];
  payment_proofs?: Record<string, Partial<PaymentProof>> | null;
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

type Tab = "staff" | "timekeeping" | "run" | "payslip" | "reports" | "settings";

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

const TOUR_SEEN_KEY = "axla_payroll_tour_seen";

const TAB_ORDER: Tab[] = ["staff", "timekeeping", "run", "payslip", "reports"];
const TAB_LABELS: Record<Tab, string> = {
  staff: "Staff",
  timekeeping: "Timekeeping",
  run: "Payroll Run",
  payslip: "Payslip & BIR",
  reports: "Reports",
  settings: "Settings",
};

/** Same copy is reused as the tour modal step body, the per-tab "?" tooltip, and (for Staff/Timekeeping) the data-driven empty-state message — one source of truth instead of three copies drifting apart. */
function tabGuide(ownerId: string): Record<Tab, string> {
  return {
    staff: "Step 1: Add your staff here. Name, GCash number, Daily rate (₱479 Batangas min). This is base for salary. DOLE Guard will warn if below minimum.",
    timekeeping:
      "Step 2: Where days come from. Each staff gets their own AI Selfie clock link (copy it from the Staff tab) — share it, they tap Time In/Out with a selfie + location, and you approve anything outside the shop. No attendance = no days = ₱0 payroll — add at least 1 entry!",
    run: "Step 3: One-click compute. Click Compute Sahod → Select cut-off Aug 1-15 → Preview Gross = Daily Rate × Days Present → Net → Finalize. This saves to history and updates This Month Payroll KPI.",
    payslip: "Step 4: After finalizing, view PDF payslip per staff, 1-click send to GCash number, BIR 1601C + 2316 auto-generated from your runs — NO FILLUP from company profile.",
    reports: "Step 5: Monitor. Monthly history, 13th month = total/12, SIL 5 days tracker, DOLE alerts. When you have 1 run, see Explore TaxLaya upsell banner for BIR filing.",
    settings: "Set your shop's location and geofence radius so AI Selfie clock-ins can tell if staff are actually on-site.",
  };
}

function GuideTooltip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Tab guide"
        className="flex h-5 w-5 items-center justify-center rounded-full border border-[#00FF88]/40 text-[10px] font-bold text-[#00FF88] hover:bg-[#00FF88]/10"
      >
        ?
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 w-72 rounded-xl border border-[#00FF88]/30 bg-[#121A22] p-3 text-xs leading-relaxed text-slate-200 shadow-xl">
          {text}
        </div>
      )}
    </div>
  );
}

function PayrollTourModal({
  ownerId,
  onGoToTab,
  onClose,
}: {
  ownerId: string;
  onGoToTab: (tab: Tab) => void;
  onClose: () => void;
}) {
  const [step, setStep] = useState(0);
  const guide = tabGuide(ownerId);
  const tab = TAB_ORDER[step];
  const isLast = step === TAB_ORDER.length - 1;

  useEffect(() => onGoToTab(tab), [tab, onGoToTab]);

  function finish() {
    localStorage.setItem(TOUR_SEEN_KEY, "1");
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl border border-[#00FF88]/30 bg-[#121A22] p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <span className="rounded-full bg-[#00FF88]/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#00FF88]">
            Step {step + 1} of {TAB_ORDER.length}
          </span>
          <button type="button" onClick={finish} className="text-gray-500 hover:text-gray-300" aria-label="Skip tour">
            <X className="h-4 w-4" />
          </button>
        </div>
        <h2 className="mt-3 text-base font-bold text-white">{TAB_LABELS[tab]}</h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-300">{guide[tab]}</p>
        <div className="mt-5 flex gap-2">
          {step > 0 && (
            <Button variant="outline" className="flex-1" onClick={() => setStep((s) => s - 1)}>
              Back
            </Button>
          )}
          <Button className="flex-1" onClick={() => (isLast ? finish() : setStep((s) => s + 1))}>
            {isLast ? "Done" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
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
  ownerId,
  autoOpenCheckoutPlan,
}: {
  businessName: string;
  plan: PayrollPlan | null;
  ownerId: string;
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
  const [showTour, setShowTour] = useState(false);
  const [tourHighlightTab, setTourHighlightTab] = useState<Tab | null>(null);

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

  // First-time tour: only once we know for sure they have no payroll history
  // yet (post-load, not mid-skeleton) and company setup isn't fighting for
  // the same modal real estate — checked every time loading finishes rather
  // than once on mount, since company setup can still be open on that pass.
  useEffect(() => {
    if (isLoading || showCompanySetup) return;
    if (runs.length > 0) return;
    if (localStorage.getItem(TOUR_SEEN_KEY) === "1") return;
    setShowTour(true);
  }, [isLoading, showCompanySetup, runs.length]);

  const handleTourGoToTab = useCallback((t: Tab) => {
    setTab(t);
    setTourHighlightTab(t);
  }, []);

  function closeTour() {
    setShowTour(false);
    setTourHighlightTab(null);
  }

  function handleCheckoutSuccess(newPlan: PayrollPlan) {
    setCurrentPlan(newPlan);
    setCheckoutOpen(false);
    toast(`Unlocked ${PAYROLL_PLAN_LABELS[newPlan]}! 🎉`);
    loadData();
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/payroll/login");
    router.refresh();
  }

  const minWage = company?.min_wage ?? DOLE_MIN_DAILY_WAGE;
  const doleWarnings = useMemo(() => staff.filter((s) => Number(s.daily_rate) < minWage), [staff, minWage]);
  const latestRun = runs[0];
  // Sum, not "latest run" — a month can have two runs now (1-15 and 16-31
  // cut-offs), and "latest" alone would silently drop the other one, or
  // show last month's total if this month hasn't been computed yet.
  const thisMonthTotal = useMemo(
    () => runs.filter((r) => r.month === currentMonthKey()).reduce((sum, r) => sum + Number(r.total_sahod), 0),
    [runs],
  );
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
          <button
            type="button"
            onClick={() => toast("Coming soon - AI Agent will auto run payroll for you!")}
            aria-label="AI voice command"
            className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 hover:bg-white/5 hover:text-[#00FF88]"
          >
            <Mic className="h-4 w-4" />
          </button>
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
              <BlurValue locked={isFree}>{isLoading ? "—" : PESO(thisMonthTotal)}</BlurValue>
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
              { id: "settings", label: "Settings" },
            ] as { id: Tab; label: string }[]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 whitespace-nowrap rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                tab === t.id ? "bg-[#00FF88] text-black" : "text-gray-400 hover:bg-white/5 hover:text-white"
              } ${tourHighlightTab === t.id ? "ring-2 ring-[#00FF88] ring-offset-2 ring-offset-[#121A22]" : ""}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "staff" && (
          <StaffTab
            staff={staff}
            isLoading={isLoading}
            tier={tier}
            guide={tabGuide(ownerId).staff}
            onChanged={loadData}
            onUpgrade={openCheckout}
          />
        )}
        {tab === "timekeeping" && (
          <TimekeepingTab
            staff={staff}
            attendance={attendance}
            isLoading={isLoading}
            tier={tier}
            guide={tabGuide(ownerId).timekeeping}
            onChanged={loadData}
            onUpgrade={openCheckout}
            onGoToSettings={() => setTab("settings")}
          />
        )}
        {tab === "run" && (
          <PayrollRunTab
            staff={staff}
            attendance={attendance}
            runs={runs}
            isLoading={isLoading}
            tier={tier}
            guide={tabGuide(ownerId).run}
            onChanged={loadData}
            onUpgrade={openCheckout}
            onGoToTimekeeping={() => setTab("timekeeping")}
          />
        )}
        {tab === "payslip" && (
          <PayslipBirTab
            company={company}
            staff={staff}
            latestRun={latestRun}
            tier={tier}
            isBusinessPlus={isBusinessPlus}
            guide={tabGuide(ownerId).payslip}
            onUpgrade={openCheckout}
            onChanged={loadData}
          />
        )}
        {tab === "reports" && (
          <ReportsTab staff={staff} runs={runs} tier={tier} guide={tabGuide(ownerId).reports} onUpgrade={openCheckout} />
        )}
        {tab === "settings" && <SettingsTab guide={tabGuide(ownerId).settings} />}
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

      {showTour && <PayrollTourModal ownerId={ownerId} onGoToTab={handleTourGoToTab} onClose={closeTour} />}
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
  guide,
  onChanged,
  onUpgrade,
}: {
  staff: Staff[];
  isLoading: boolean;
  tier: PayrollTier;
  guide: string;
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
          <GuideTooltip text={guide} />
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
            <p className="max-w-sm text-sm font-semibold text-white">{guide}</p>
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
                  <th className="pb-2 pr-4">Clock Link</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <StaffRow key={s.id} staff={s} onRemove={() => handleRemove(s.id)} />
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

function StaffRow({ staff, onRemove }: { staff: Staff; onRemove: () => void }) {
  const link = clockLinkFor(staff.clock_token);

  async function handleCopy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    toast("Clock link copied ✅");
  }

  async function handleDownloadQr() {
    if (!link) return;
    const QRCode = (await import("qrcode")).default;
    const dataUrl = await QRCode.toDataURL(link, { width: 480, margin: 2, color: { dark: "#0a0a0a", light: "#ffffff" } });
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${staff.name.trim().replace(/\s+/g, "-").toLowerCase()}-clock-qr.png`;
    a.click();
  }

  return (
    <tr className="border-b border-[#1E293B]/60 last:border-0">
      <td className="py-3 pr-4 font-medium text-white">{staff.name}</td>
      <td className="py-3 pr-4 text-gray-300">{maskGcash(staff.gcash)}</td>
      <td className={`py-3 pr-4 ${Number(staff.daily_rate) < DOLE_MIN_DAILY_WAGE ? "text-amber-400" : "text-gray-300"}`}>
        {PESO(staff.daily_rate)}
      </td>
      <td className="py-3 pr-4">
        {link ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleCopy}
              title={link}
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#00FF88]/30 px-2 text-xs text-[#00FF88] hover:bg-[#00FF88]/10"
            >
              <Copy className="h-3 w-3" />
              Copy Link
            </button>
            <button
              type="button"
              onClick={handleDownloadQr}
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#1E293B] px-2 text-xs text-slate-200 hover:bg-white/5"
            >
              <QrCode className="h-3 w-3" />
              QR
            </button>
          </div>
        ) : (
          <span className="text-xs text-gray-600">—</span>
        )}
      </td>
      <td className="py-3">
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex h-7 items-center gap-1 rounded-lg border border-red-900/40 px-2 text-xs text-red-300 hover:bg-red-950/30"
        >
          Remove
        </button>
      </td>
    </tr>
  );
}

function TimekeepingTab({
  staff,
  attendance,
  isLoading,
  tier,
  guide,
  onChanged,
  onUpgrade,
  onGoToSettings,
}: {
  staff: Staff[];
  attendance: AttendanceRow[];
  isLoading: boolean;
  tier: PayrollTier;
  guide: string;
  onChanged: () => void;
  onUpgrade: (plan?: PayrollPlan) => void;
  onGoToSettings: () => void;
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
    <div className="space-y-4">
      <ShopCodeBanner onGoToSettings={onGoToSettings} />

      <TimekeepingLogsSection />

      <Card className={PREMIUM_CARD}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold text-white">Manual Time In/Out — Today</CardTitle>
            <GuideTooltip text={guide} />
          </div>
        </CardHeader>
        <CardContent>
          {!isLoading && staff.length > 0 && attendance.length === 0 && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-300">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{guide}</span>
            </div>
          )}
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
            For clocking staff in yourself, e.g. at a shared counter. Staff clocking in on their own phone should use their Clock Link from the Staff tab instead — it's the one with selfie + location verification.
          </p>
          {tier === "free" && (
            <p className="mt-1 text-xs text-gray-500">Free plan: {FREE_ATTENDANCE_LIMIT} manual entry. Upgrade to Starter ₱149/mo for unlimited.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function ShopCodeBanner({ onGoToSettings }: { onGoToSettings: () => void }) {
  const [settings, setSettings] = useState<ShopSettings | null>(null);

  useEffect(() => {
    fetch("/api/payroll/shop/settings", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setSettings(data.settings))
      .catch(() => {});
  }, []);

  return (
    <div className="rounded-2xl border border-[#00FF88]/20 bg-[#00FF88]/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-xl bg-[#00FF88]/10 px-4 py-2 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-[#00FF88]/70">Today&apos;s Shop Code</p>
            <p className="text-2xl font-black tracking-widest text-[#00FF88]">{settings?.daily_code ?? "····"}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">
              <Sparkles className="mr-1 inline h-3.5 w-3.5 text-[#00FF88]" />
              AI Selfie Timekeeping enabled
            </p>
            <p className="text-xs text-gray-400">Write the code on the whiteboard. Share each staff&apos;s link from the Staff tab.</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onGoToSettings}
          className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#00FF88]/30 px-3 text-xs font-semibold text-[#00FF88] hover:bg-[#00FF88]/10"
        >
          <MapPin className="h-3.5 w-3.5" />
          Shop Location
        </button>
      </div>
    </div>
  );
}

type LogFilter = "all" | "inside" | "needsApproval";

function TimekeepingLogsSection() {
  const [logs, setLogs] = useState<TimekeepingLog[]>([]);
  const [counts, setCounts] = useState({ all: 0, inside: 0, needsApproval: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<LogFilter>("all");
  const [viewingSelfie, setViewingSelfie] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [comparingLogId, setComparingLogId] = useState<string | null>(null);
  const [flaggingId, setFlaggingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/payroll/timekeeping/logs", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.logs ?? []);
        setCounts(data.counts ?? { all: 0, inside: 0, needsApproval: 0 });
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const interval = setInterval(load, 30_000);
    return () => clearInterval(interval);
  }, [load]);

  async function handleReview(id: string, approved: boolean) {
    setActingId(id);
    try {
      const res = await fetch(`/api/payroll/timekeeping/logs/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approved }),
      });
      if (res.ok) {
        toast(approved ? "Approved ✅" : "Rejected");
        load();
      } else {
        toast("Failed to update — try again.");
      }
    } catch {
      toast("Network error — try again.");
    } finally {
      setActingId(null);
    }
  }

  async function handleFlagBuddyPunch(id: string) {
    setFlaggingId(id);
    try {
      const res = await fetch(`/api/payroll/timekeeping/logs/${id}/flag-buddy-punch`, { method: "POST" });
      if (res.ok) {
        toast("Flagged as buddy punching 🚩");
        load();
      } else {
        toast("Failed to flag — try again.");
      }
    } catch {
      toast("Network error — try again.");
    } finally {
      setFlaggingId(null);
    }
  }

  const filtered = logs.filter((l) => {
    if (filter === "inside") return !l.is_outside;
    if (filter === "needsApproval") return l.needs_approval;
    return true;
  });

  // `logs` is already ordered desc by created_at (see the API route) — the
  // first entry after this one, for the same staff, is their previous
  // clock event. Used by "Compare with last selfie" (finding #5's manual
  // side-by-side mitigation) — no extra fetch needed, everything's already loaded.
  function findPreviousLog(log: TimekeepingLog): TimekeepingLog | null {
    const idx = logs.findIndex((l) => l.id === log.id);
    if (idx === -1) return null;
    return logs.slice(idx + 1).find((l) => l.staff_id === log.staff_id) ?? null;
  }

  const comparingLog = comparingLogId ? (logs.find((l) => l.id === comparingLogId) ?? null) : null;
  const comparingPrevious = comparingLog ? findPreviousLog(comparingLog) : null;

  return (
    <Card className={PREMIUM_CARD}>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-sm font-semibold text-white">Clock-In Activity</CardTitle>
        <div className="flex gap-1 rounded-xl border border-[#1E293B] bg-[#0B121A] p-1">
          {(
            [
              { id: "all", label: `All (${counts.all})` },
              { id: "inside", label: `Inside Only (${counts.inside})` },
              { id: "needsApproval", label: `Needs Approval (${counts.needsApproval})` },
            ] as { id: LogFilter; label: string }[]
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                filter === f.id ? "bg-[#00FF88] text-black" : "text-gray-400 hover:text-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-12 w-full animate-pulse rounded-lg bg-white/5" />
        ) : filtered.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No clock-in activity yet — share a staff link from the Staff tab.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1E293B] text-left text-xs uppercase tracking-wide text-gray-500">
                  <th className="pb-2 pr-4">Time</th>
                  <th className="pb-2 pr-4">Employee</th>
                  <th className="pb-2 pr-4">Type</th>
                  <th className="pb-2 pr-4">Distance</th>
                  <th className="pb-2 pr-4">Selfie</th>
                  <th className="pb-2 pr-4">Code</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2 pr-4">Flags</th>
                  <th className="pb-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((log) => (
                  <tr key={log.id} className="border-b border-[#1E293B]/60 last:border-0">
                    <td className="py-3 pr-4 text-gray-300">
                      {new Date(log.created_at).toLocaleTimeString("en-PH", { hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="py-3 pr-4 font-medium text-white">{log.staff_name}</td>
                    <td className="py-3 pr-4">
                      <span className={log.type === "in" ? "text-[#00FF88]" : "text-amber-400"}>{log.type.toUpperCase()}</span>
                    </td>
                    <td className="py-3 pr-4 text-gray-300">
                      {log.distance_meters === null ? (
                        "—"
                      ) : log.is_outside ? (
                        <span className="text-amber-400">
                          ⚠️ {log.distance_meters >= 1000 ? `${(log.distance_meters / 1000).toFixed(1)}km` : `${Math.round(log.distance_meters)}m`} Outside
                        </span>
                      ) : (
                        <span className="text-[#00FF88]">📍 {Math.round(log.distance_meters)}m Inside</span>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      {log.selfie_url ? (
                        <button type="button" onClick={() => setViewingSelfie(log.selfie_url)} className="block">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={log.selfie_url} alt="Selfie" className="h-10 w-10 rounded-lg border border-[#1E293B] object-cover hover:border-[#00FF88]/50" />
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="py-3 pr-4">{log.daily_code_match ? "✓" : "✗"}</td>
                    <td className="py-3 pr-4">
                      {log.needs_approval ? (
                        <Badge variant="warning">⏳ Pending</Badge>
                      ) : log.approved === false ? (
                        <Badge variant="destructive">Rejected</Badge>
                      ) : (
                        <Badge variant="success">✅ Approved</Badge>
                      )}
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex flex-col gap-1">
                        {log.flag?.split(",").filter(Boolean).map((code) => (
                          <span
                            key={code}
                            title={log.flag_note ?? undefined}
                            className="inline-flex w-fit items-center gap-1 rounded-full border border-red-900/40 bg-red-950/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-300"
                          >
                            🚨 {code.replace(/_/g, " ")}
                          </span>
                        ))}
                        {log.buddy_punch_flagged && (
                          <span className="inline-flex w-fit items-center gap-1 rounded-full border border-red-900/40 bg-red-950/30 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-red-300">
                            🚩 Buddy Punch
                          </span>
                        )}
                        {!log.flag && !log.buddy_punch_flagged && <span className="text-gray-600">—</span>}
                      </div>
                    </td>
                    <td className="py-3">
                      <div className="flex items-center gap-1">
                        {log.needs_approval && (
                          <>
                            <button
                              type="button"
                              disabled={actingId === log.id}
                              onClick={() => handleReview(log.id, true)}
                              className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#00FF88]/30 px-2 text-xs text-[#00FF88] hover:bg-[#00FF88]/10 disabled:opacity-50"
                            >
                              <Check className="h-3 w-3" />
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={actingId === log.id}
                              onClick={() => handleReview(log.id, false)}
                              className="inline-flex h-7 items-center gap-1 rounded-lg border border-red-900/40 px-2 text-xs text-red-300 hover:bg-red-950/30 disabled:opacity-50"
                            >
                              <XCircle className="h-3 w-3" />
                              Reject
                            </button>
                          </>
                        )}
                        {findPreviousLog(log)?.selfie_url && (
                          <button
                            type="button"
                            onClick={() => setComparingLogId(log.id)}
                            className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#1E293B] px-2 text-xs text-gray-300 hover:bg-white/5"
                          >
                            Compare
                          </button>
                        )}
                        {!log.buddy_punch_flagged && (
                          <button
                            type="button"
                            disabled={flaggingId === log.id}
                            onClick={() => handleFlagBuddyPunch(log.id)}
                            className="inline-flex h-7 items-center gap-1 rounded-lg border border-red-900/40 px-2 text-xs text-red-300 hover:bg-red-950/30 disabled:opacity-50"
                          >
                            🚩 Flag
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

      {viewingSelfie && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setViewingSelfie(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewingSelfie} alt="Selfie full size" className="max-h-[80vh] max-w-full rounded-2xl border border-white/10" />
        </div>
      )}

      {/* Security audit finding #5's manual-review mitigation — there's no
          automated face-match here (that's the documented Phase 2 plan),
          just the two selfies side by side for the owner to eyeball. */}
      {comparingLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setComparingLogId(null)}>
          <div className="w-full max-w-lg rounded-2xl border border-[#1E293B] bg-[#0B121A] p-5" onClick={(e) => e.stopPropagation()}>
            <p className="mb-3 text-sm font-semibold text-white">Compare selfies — {comparingLog.staff_name}</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="mb-1 text-center text-[11px] uppercase tracking-wide text-gray-500">
                  {comparingPrevious ? new Date(comparingPrevious.created_at).toLocaleString("en-PH") : "—"}
                </p>
                {comparingPrevious?.selfie_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={comparingPrevious.selfie_url} alt="Previous selfie" className="aspect-square w-full rounded-xl border border-[#1E293B] object-cover" />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-[#1E293B] text-xs text-gray-600">No prior selfie</div>
                )}
              </div>
              <div>
                <p className="mb-1 text-center text-[11px] uppercase tracking-wide text-[#00FF88]">
                  {new Date(comparingLog.created_at).toLocaleString("en-PH")} (this one)
                </p>
                {comparingLog.selfie_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={comparingLog.selfie_url} alt="Current selfie" className="aspect-square w-full rounded-xl border border-[#00FF88]/40 object-cover" />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center rounded-xl border border-[#1E293B] text-xs text-gray-600">No selfie</div>
                )}
              </div>
            </div>
            <div className="mt-4 flex items-center justify-end gap-2">
              {!comparingLog.buddy_punch_flagged && (
                <button
                  type="button"
                  onClick={() => {
                    handleFlagBuddyPunch(comparingLog.id);
                    setComparingLogId(null);
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-900/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/30"
                >
                  🚩 Flag as buddy punching
                </button>
              )}
              <button
                type="button"
                onClick={() => setComparingLogId(null)}
                className="rounded-lg border border-[#1E293B] px-3 py-1.5 text-xs text-gray-300 hover:bg-white/5"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

function MissingAttendanceModal({
  cutOff,
  missingCount,
  onUseDefault,
  onGoToTimekeeping,
  onClose,
}: {
  cutOff: CutOff;
  missingCount: number;
  onUseDefault: () => void;
  onGoToTimekeeping: () => void;
  onClose: () => void;
}) {
  const defaultDays = DEFAULT_DAYS_BY_CUTOFF[cutOff];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-amber-500/40 bg-[#121A22] p-6 shadow-2xl">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <h2 className="text-base font-bold text-white">No attendance found</h2>
            <p className="mt-1 text-sm text-slate-300">
              {missingCount} staff have no attendance on file for this cut-off ({CUTOFF_LABELS[cutOff]}). Use default {defaultDays}{" "}
              days? Or add attendance first in the Timekeeping tab.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col gap-2">
          <Button onClick={onUseDefault} className="w-full">
            Use {defaultDays} days default
          </Button>
          <Button variant="outline" onClick={onGoToTimekeeping} className="w-full">
            Go to Timekeeping
          </Button>
          <button type="button" onClick={onClose} className="mt-1 text-xs text-gray-500 hover:text-gray-300">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function RunDetailsModal({ run, onClose }: { run: PayrollRun; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-md rounded-2xl border border-[#1E293B] bg-[#121A22] p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">
            {run.month} {run.cut_off ? `· ${CUTOFF_LABELS[run.cut_off]}` : ""}
          </h2>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-300" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-4 max-h-96 space-y-2 overflow-y-auto">
          {run.breakdown.map((row) => (
            <div key={row.staffId} className="rounded-lg border border-[#1E293B] bg-[#0B121A] px-3 py-2">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-white">{row.name}</p>
                {row.estimated && (
                  <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-400">
                    Estimated
                  </span>
                )}
              </div>
              <div className="mt-1 flex justify-between text-xs text-gray-400">
                <span>
                  {PESO(row.dailyRate)} × {row.daysPresent} days
                </span>
                <span className="font-semibold text-[#00FF88]">{PESO(row.basicPay)}</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 flex justify-between border-t border-[#1E293B] pt-3 text-sm">
          <span className="font-semibold text-white">Total Sahod</span>
          <span className="font-bold text-[#00FF88]">{PESO(run.total_sahod)}</span>
        </div>
      </div>
    </div>
  );
}

function PayrollRunTab({
  staff,
  attendance,
  runs,
  isLoading,
  tier,
  guide,
  onChanged,
  onUpgrade,
  onGoToTimekeeping,
}: {
  staff: Staff[];
  attendance: AttendanceRow[];
  runs: PayrollRun[];
  isLoading: boolean;
  tier: PayrollTier;
  guide: string;
  onChanged: () => void;
  onUpgrade: (plan?: PayrollPlan) => void;
  onGoToTimekeeping: () => void;
}) {
  const [isComputing, setIsComputing] = useState(false);
  const [cutOff, setCutOff] = useState<CutOff>("1-15");
  const [missingCount, setMissingCount] = useState(0);
  const [showMissingModal, setShowMissingModal] = useState(false);
  const [viewingRun, setViewingRun] = useState<PayrollRun | null>(null);
  const isFree = tier === "free";

  async function doCompute(useDefaultForMissing: boolean) {
    setShowMissingModal(false);
    setIsComputing(true);
    try {
      const res = await fetch("/api/payroll/runs/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: currentMonthKey(), cutOff, useDefaultForMissing }),
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
      toast(`Sahod computed ✅ ${PESO(data.run.total_sahod)}`);
      onChanged();
    } catch {
      toast("Network error — try again.");
    } finally {
      setIsComputing(false);
    }
  }

  function handleComputeClick() {
    if (isFree) {
      onUpgrade("starter");
      return;
    }
    const range = getCutOffRange(currentMonthKey(), cutOff);
    const missing = staff.filter(
      (s) => !attendance.some((a) => a.staff_id === s.id && a.date >= range.from && a.date < range.to && a.time_in && a.time_out),
    );
    if (missing.length > 0) {
      setMissingCount(missing.length);
      setShowMissingModal(true);
      return;
    }
    doCompute(false);
  }

  return (
    <Card className={PREMIUM_CARD}>
      <CardHeader className="flex-col items-start gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-semibold text-white">Payroll Run — {currentMonthKey()}</CardTitle>
          <GuideTooltip text={guide} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-xl border border-[#1E293B] bg-[#0B121A] p-1">
            {(Object.keys(CUTOFF_LABELS) as CutOff[]).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCutOff(c)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                  cutOff === c ? "bg-[#00FF88] text-black" : "text-gray-400 hover:text-white"
                }`}
              >
                {CUTOFF_LABELS[c]}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={handleComputeClick} disabled={isComputing || staff.length === 0} variant={isFree ? "outline" : "default"}>
            {isComputing ? <Loader2 className="h-4 w-4 animate-spin" /> : isFree ? <Lock className="h-4 w-4" /> : <Wallet className="h-4 w-4" />}
            {isComputing ? "Computing..." : isFree ? "Unlock for ₱149" : "Compute Sahod"}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-12 w-full animate-pulse rounded-lg bg-white/5" />
        ) : runs.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Wallet className="h-10 w-10 text-[#00FF88]" />
            <p className="max-w-sm text-sm font-semibold text-white">{isFree ? "Run your first payroll — Unlock Business" : guide}</p>
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
                  <th className="pb-2 pr-4">Cut-off</th>
                  <th className="pb-2 pr-4">Total Sahod</th>
                  <th className="pb-2 pr-4">Staff</th>
                  <th className="pb-2 pr-4">Status</th>
                  <th className="pb-2" />
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id} className="border-b border-[#1E293B]/60 last:border-0">
                    <td className="py-3 pr-4 font-medium text-white">{r.month}</td>
                    <td className="py-3 pr-4 text-gray-300">{r.cut_off ? CUTOFF_LABELS[r.cut_off] : "—"}</td>
                    <td className="py-3 pr-4 text-gray-300">{PESO(r.total_sahod)}</td>
                    <td className="py-3 pr-4 text-gray-300">{r.breakdown?.length ?? 0}</td>
                    <td className="py-3 pr-4">
                      <Badge variant="success">{r.status === "finalized" ? "Finalized" : "Draft"}</Badge>
                    </td>
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={() => setViewingRun(r)}
                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#1E293B] px-2 text-xs text-slate-200 hover:bg-white/5"
                      >
                        View Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {showMissingModal && (
        <MissingAttendanceModal
          cutOff={cutOff}
          missingCount={missingCount}
          onUseDefault={() => doCompute(true)}
          onGoToTimekeeping={() => {
            setShowMissingModal(false);
            onGoToTimekeeping();
          }}
          onClose={() => setShowMissingModal(false)}
        />
      )}

      {viewingRun && <RunDetailsModal run={viewingRun} onClose={() => setViewingRun(null)} />}
    </Card>
  );
}

function PaymentStatusBadge({ status }: { status: PaymentProofStatus }) {
  if (status === "confirmed") return <Badge variant="success">Confirmed</Badge>;
  if (status === "paid") return <Badge className="bg-blue-500/15 text-blue-400 ring-1 ring-inset ring-blue-500/30">Paid</Badge>;
  return <Badge>Unpaid</Badge>;
}

function PayslipBirTab({
  company,
  staff,
  latestRun,
  tier,
  isBusinessPlus,
  guide,
  onUpgrade,
  onChanged,
}: {
  company: Company | null;
  staff: Staff[];
  latestRun: PayrollRun | undefined;
  tier: PayrollTier;
  isBusinessPlus: boolean;
  guide: string;
  onUpgrade: (plan?: PayrollPlan) => void;
  onChanged: () => void;
}) {
  const isFree = tier === "free";
  const totalWithholding = latestRun ? estimateWithholdingTax(latestRun.total_sahod) : 0;
  const [filter, setFilter] = useState<PaymentProofStatus | "all">("all");
  const [payModalRow, setPayModalRow] = useState<PayrollBreakdownRow | null>(null);
  const [cashModalRow, setCashModalRow] = useState<PayrollBreakdownRow | null>(null);
  const [proofModalRow, setProofModalRow] = useState<PayrollBreakdownRow | null>(null);

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const rows = latestRun?.breakdown ?? [];
  const proofByStaff = useMemo(() => {
    const map = new Map<string, PaymentProof>();
    for (const row of rows) map.set(row.staffId, getPaymentProof(latestRun?.payment_proofs, row.staffId));
    return map;
  }, [rows, latestRun]);

  const totalAll = latestRun?.total_sahod ?? 0;
  const totalPaid = rows.reduce((sum, r) => (proofByStaff.get(r.staffId)?.status !== "unpaid" ? sum + r.basicPay : sum), 0);
  const paidCount = rows.filter((r) => proofByStaff.get(r.staffId)?.status !== "unpaid").length;
  const progressPct = totalAll > 0 ? Math.min(100, Math.round((totalPaid / totalAll) * 100)) : 0;
  const filteredRows = filter === "all" ? rows : rows.filter((r) => proofByStaff.get(r.staffId)?.status === filter);

  async function handleDownload(row: PayrollBreakdownRow) {
    const { generatePayslipPdf } = await import("@/lib/payroll/payslip-pdf");
    generatePayslipPdf({
      businessName: company?.business_name ?? "Your Business",
      staffName: row.name,
      dailyRate: row.dailyRate,
      daysPresent: row.daysPresent,
      basicPay: row.basicPay,
      gcash: staffById.get(row.staffId)?.gcash ?? null,
      demo: isFree,
    });
  }

  return (
    <div className="space-y-4">
      <Card className={PREMIUM_CARD}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold text-white">Payslip &amp; Proof of Payment</CardTitle>
            <GuideTooltip text={guide} />
          </div>
        </CardHeader>
        <CardContent>
          {!latestRun ? (
            <p className="py-8 text-center text-sm text-gray-500">
              {isFree ? "Demo preview only — compute a payroll run to generate real payslips." : "Compute a payroll run first."}
            </p>
          ) : (
            <>
              <div className="mb-4 rounded-xl border border-[#1E293B] bg-[#0B121A] p-4">
                <p className="text-lg font-bold text-white">
                  {PESO(totalPaid)}{" "}
                  <span className="text-sm font-normal text-gray-500">
                    / {PESO(totalAll)} Paid ({paidCount}/{rows.length})
                  </span>
                </p>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/5">
                  <div className="h-full rounded-full bg-[#00FF88] transition-all" style={{ width: `${progressPct}%` }} />
                </div>
                <div className="mt-3 flex gap-1 rounded-xl border border-[#1E293B] bg-[#080F14] p-1">
                  {(["all", "unpaid", "paid", "confirmed"] as (PaymentProofStatus | "all")[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className={`flex-1 rounded-lg px-2 py-1.5 text-xs font-semibold capitalize transition ${
                        filter === f ? "bg-[#00FF88] text-black" : "text-gray-400 hover:text-white"
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              {isFree && (
                <p className="mb-3 rounded-lg border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-center text-xs text-red-300">
                  Demo preview — upgrade to record and track real payments.
                </p>
              )}

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1E293B] text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="pb-2 pr-4">Employee</th>
                      <th className="pb-2 pr-4">Net Pay</th>
                      <th className="pb-2 pr-4">GCash</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2 pr-4">Proof</th>
                      <th className="pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRows.map((row) => {
                      const proof = proofByStaff.get(row.staffId) ?? UNPAID_PROOF;
                      const gcash = staffById.get(row.staffId)?.gcash ?? null;
                      return (
                        <tr key={row.staffId} className="border-b border-[#1E293B]/60 last:border-0">
                          <td className="py-3 pr-4 font-medium text-white">{row.name}</td>
                          <td className="py-3 pr-4 text-gray-300">{PESO(row.basicPay)}</td>
                          <td className="py-3 pr-4 text-gray-300">{maskGcash(gcash)}</td>
                          <td className="py-3 pr-4">
                            <PaymentStatusBadge status={proof.status} />
                          </td>
                          <td className="py-3 pr-4">
                            {proof.receiptUrl ? (
                              <button type="button" onClick={() => setProofModalRow(row)} className="block">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={proof.receiptUrl}
                                  alt="Receipt"
                                  className="h-10 w-10 rounded-lg border border-[#1E293B] object-cover hover:border-[#00FF88]/50"
                                />
                              </button>
                            ) : proof.status !== "unpaid" ? (
                              <button type="button" onClick={() => setProofModalRow(row)} className="text-xs text-gray-400 underline hover:text-white">
                                {proof.note ?? "View"}
                              </button>
                            ) : (
                              <span className="text-xs text-gray-600">—</span>
                            )}
                          </td>
                          <td className="py-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              {proof.status === "unpaid" ? (
                                isFree ? (
                                  <button
                                    type="button"
                                    onClick={() => onUpgrade()}
                                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#00FF88]/30 px-2 text-xs text-[#00FF88] hover:bg-[#00FF88]/10"
                                  >
                                    <Lock className="h-3 w-3" /> Upgrade
                                  </button>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => setPayModalRow(row)}
                                      className="inline-flex h-7 items-center gap-1 rounded-lg bg-[#00FF88] px-2 text-xs font-semibold text-black hover:bg-[#22C55E]"
                                    >
                                      <Wallet className="h-3 w-3" />
                                      Pay via GCash
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setCashModalRow(row)}
                                      className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#1E293B] px-2 text-xs text-slate-200 hover:bg-white/5"
                                    >
                                      Mark Paid
                                    </button>
                                  </>
                                )
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setProofModalRow(row)}
                                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#1E293B] px-2 text-xs text-slate-200 hover:bg-white/5"
                                >
                                  View Proof
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDownload(row)}
                                aria-label="Download payslip PDF"
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#1E293B] text-slate-300 hover:bg-white/5"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {payModalRow && latestRun && (
        <PayViaGcashModal
          runId={latestRun.id}
          row={payModalRow}
          gcash={staffById.get(payModalRow.staffId)?.gcash ?? null}
          onClose={() => setPayModalRow(null)}
          onSaved={() => {
            setPayModalRow(null);
            onChanged();
          }}
        />
      )}
      {cashModalRow && latestRun && (
        <MarkPaidCashModal
          runId={latestRun.id}
          row={cashModalRow}
          onClose={() => setCashModalRow(null)}
          onSaved={() => {
            setCashModalRow(null);
            onChanged();
          }}
        />
      )}
      {proofModalRow && latestRun && <ViewProofModal runId={latestRun.id} row={proofModalRow} onClose={() => setProofModalRow(null)} />}

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

function PayViaGcashModal({
  runId,
  row,
  gcash,
  onClose,
  onSaved,
}: {
  runId: string;
  row: PayrollBreakdownRow;
  gcash: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [step, setStep] = useState<"send" | "upload">("send");
  const [amount, setAmount] = useState(String(row.basicPay));
  const [gcashRef, setGcashRef] = useState("");
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amountMismatch = Number(amount) !== row.basicPay;

  async function handleCopy(text: string, label: string) {
    await navigator.clipboard.writeText(text);
    toast(`${label} copied ✅`);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setReceiptFile(file);
    setReceiptPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!receiptFile) {
      setError("Upload the GCash receipt screenshot.");
      return;
    }
    if (!gcashRef.trim()) {
      setError("Enter the GCash reference number.");
      return;
    }
    setError(null);
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append("amount", amount);
      formData.append("gcashRef", gcashRef.trim());
      formData.append("receipt", receiptFile);
      const res = await fetch(`/api/payroll/runs/${runId}/payment/${row.staffId}`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save payment.");
        return;
      }
      toast("Payment recorded ✅");
      onSaved();
    } catch {
      setError("Network error — try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#00FF88]/30 bg-[#121A22] p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Pay via GCash</h2>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-300" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "send" ? (
          <div className="mt-4 space-y-4">
            <div className="rounded-xl border border-[#00FF88]/20 bg-[#00FF88]/[0.04] p-4 text-center">
              <p className="text-xs uppercase tracking-wide text-gray-500">Send</p>
              <p className="text-2xl font-black text-[#00FF88]">{PESO(row.basicPay)}</p>
              <p className="mt-1 text-sm text-gray-300">
                to {maskGcash(gcash)} ({row.name})
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleCopy(String(row.basicPay), "Amount")}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#1E293B] text-xs text-slate-200 hover:bg-white/5"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy Amount
              </button>
              <button
                type="button"
                onClick={() => gcash && handleCopy(gcash, "GCash number")}
                disabled={!gcash}
                className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[#1E293B] text-xs text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Copy className="h-3.5 w-3.5" />
                Copy Number
              </button>
            </div>
            <button
              type="button"
              onClick={() => window.open("https://www.gcash.com", "_blank")}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#00FF88]/30 py-2.5 text-sm font-semibold text-[#00FF88] hover:bg-[#00FF88]/10"
            >
              <Send className="h-4 w-4" />
              Open GCash App
            </button>
            <Button onClick={() => setStep("upload")} className="w-full">
              I&apos;ve Sent It — Upload Receipt
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">GCash Receipt Screenshot</label>
              {receiptPreview && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={receiptPreview} alt="Receipt preview" className="mb-2 h-32 w-full rounded-lg border border-[#1E293B] object-cover" />
              )}
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="w-full text-xs text-gray-400 file:mr-3 file:rounded-lg file:border-0 file:bg-[#00FF88]/15 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-[#00FF88]"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">GCash Ref No.</label>
              <Input value={gcashRef} onChange={(e) => setGcashRef(e.target.value)} placeholder="From the receipt" className="border-[#1E293B] bg-[#0B121A]" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Amount Sent</label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="border-[#1E293B] bg-[#0B121A]" />
              {amountMismatch && (
                <p className="mt-1 text-xs text-amber-400">Doesn&apos;t match Net Pay {PESO(row.basicPay)} — double check before saving.</p>
              )}
            </div>
            {error && <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">{error}</div>}
            <Button type="submit" disabled={isSaving} className="w-full">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isSaving ? "Saving..." : "Save Proof of Payment"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

function MarkPaidCashModal({
  runId,
  row,
  onClose,
  onSaved,
}: {
  runId: string;
  row: PayrollBreakdownRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(String(row.basicPay));
  const [note, setNote] = useState("Cash");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const formData = new FormData();
      formData.append("amount", amount);
      formData.append("note", note.trim() || "Cash");
      const res = await fetch(`/api/payroll/runs/${runId}/payment/${row.staffId}`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save payment.");
        return;
      }
      toast("Marked as paid ✅");
      onSaved();
    } catch {
      setError("Network error — try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#1E293B] bg-[#121A22] p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Mark as Paid — {row.name}</h2>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-300" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">For cash or any payment made outside GCash — no receipt required.</p>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Amount</label>
            <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className="border-[#1E293B] bg-[#0B121A]" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Note</label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Cash" className="border-[#1E293B] bg-[#0B121A]" />
          </div>
          {error && <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">{error}</div>}
          <Button type="submit" disabled={isSaving} className="w-full">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isSaving ? "Saving..." : "Mark as Paid"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function ViewProofModal({ runId, row, onClose }: { runId: string; row: PayrollBreakdownRow; onClose: () => void }) {
  const [data, setData] = useState<{ proof: PaymentProof; receiptUrl: string | null; confirmedSelfieUrl: string | null } | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/payroll/runs/${runId}/payment/${row.staffId}`, { cache: "no-store" })
      .then((res) => res.json())
      .then(setData)
      .finally(() => setIsLoading(false));
  }, [runId, row.staffId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-2xl border border-[#1E293B] bg-[#121A22] p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Proof of Payment — {row.name}</h2>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-300" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {isLoading ? (
          <div className="mt-4 h-40 w-full animate-pulse rounded-lg bg-white/5" />
        ) : data ? (
          <div className="mt-4 space-y-3 text-sm">
            {data.receiptUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={data.receiptUrl} alt="GCash receipt" className="w-full rounded-lg border border-[#1E293B] object-cover" />
            ) : (
              <p className="rounded-lg border border-[#1E293B] bg-[#0B121A] px-3 py-2 text-gray-400">{data.proof.note ?? "No receipt uploaded."}</p>
            )}
            <div className="space-y-1 text-gray-300">
              <div className="flex justify-between">
                <span>Amount</span>
                <span className="font-semibold text-white">{data.proof.amount !== null ? PESO(data.proof.amount) : "—"}</span>
              </div>
              {data.proof.gcashRef && (
                <div className="flex justify-between">
                  <span>Ref No.</span>
                  <span className="font-semibold text-white">{data.proof.gcashRef}</span>
                </div>
              )}
              {data.proof.paidAt && (
                <div className="flex justify-between">
                  <span>Paid At</span>
                  <span className="text-white">{new Date(data.proof.paidAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</span>
                </div>
              )}
              {data.proof.confirmedAt && (
                <div className="flex justify-between">
                  <span>Confirmed At</span>
                  <span className="text-[#00FF88]">{new Date(data.proof.confirmedAt).toLocaleString("en-PH", { timeZone: "Asia/Manila" })}</span>
                </div>
              )}
            </div>
            {data.confirmedSelfieUrl && (
              <div>
                <p className="mb-1 text-xs text-gray-500">Employee confirmation selfie</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={data.confirmedSelfieUrl} alt="Confirmation selfie" className="h-24 w-24 rounded-lg border border-[#1E293B] object-cover" />
              </div>
            )}
            {data.receiptUrl && (
              <a
                href={data.receiptUrl}
                download
                target="_blank"
                rel="noreferrer"
                className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#1E293B] py-2 text-xs text-slate-200 hover:bg-white/5"
              >
                <Download className="h-3.5 w-3.5" />
                Download Receipt
              </a>
            )}
          </div>
        ) : (
          <p className="mt-4 text-sm text-gray-500">Failed to load.</p>
        )}
      </div>
    </div>
  );
}

interface PaymentAuditRow {
  runId: string;
  month: string;
  staffName: string;
  gcash: string | null;
  amount: number | null;
  gcashRef: string | null;
  note: string | null;
  status: PaymentProofStatus;
  paidAt: string | null;
  confirmedAt: string | null;
  receiptUrl: string | null;
}

function exportPaymentAuditCsv(rows: PaymentAuditRow[]) {
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const header = ["Employee", "Amount", "GCash", "Ref", "Paid At", "Confirmed At", "Receipt URL"];
  const lines = [header.map(escape).join(",")];
  for (const r of rows) {
    lines.push(
      [
        r.staffName,
        r.amount !== null ? String(r.amount) : "",
        r.gcash ?? "",
        r.gcashRef ?? r.note ?? "",
        r.paidAt ?? "",
        r.confirmedAt ?? "",
        r.receiptUrl ?? "",
      ]
        .map(escape)
        .join(","),
    );
  }
  const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `payroll-payment-audit-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function ReportsTab({
  staff,
  runs,
  tier,
  guide,
  onUpgrade,
}: {
  staff: Staff[];
  runs: PayrollRun[];
  tier: PayrollTier;
  guide: string;
  onUpgrade: (plan?: PayrollPlan) => void;
}) {
  const currentYear = new Date().getFullYear();
  const ytdTotal = runs.filter((r) => r.month.startsWith(String(currentYear))).reduce((sum, r) => sum + Number(r.total_sahod), 0);
  const thirteenthMonthAccrual = ytdTotal / 12;

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);
  const auditRows = useMemo(() => {
    const rows: PaymentAuditRow[] = [];
    for (const run of runs) {
      for (const entry of run.breakdown ?? []) {
        const proof = getPaymentProof(run.payment_proofs, entry.staffId);
        if (proof.status === "unpaid") continue;
        rows.push({
          runId: run.id,
          month: run.month,
          staffName: entry.name,
          gcash: staffById.get(entry.staffId)?.gcash ?? null,
          amount: proof.amount,
          gcashRef: proof.gcashRef,
          note: proof.note,
          status: proof.status,
          paidAt: proof.paidAt,
          confirmedAt: proof.confirmedAt,
          receiptUrl: proof.receiptUrl ?? null,
        });
      }
    }
    return rows;
  }, [runs, staffById]);

  return (
    <div className="space-y-4">
      <Card className={PREMIUM_CARD}>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-sm font-semibold text-white">Reports</CardTitle>
            <GuideTooltip text={guide} />
          </div>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <FileText className="h-10 w-10 text-[#00FF88]" />
              <p className="max-w-sm text-sm font-semibold text-white">{guide}</p>
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

      {auditRows.length > 0 && (
        <Card className={PREMIUM_CARD}>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-semibold text-white">Payment Audit Trail</CardTitle>
            <button
              type="button"
              onClick={() => exportPaymentAuditCsv(auditRows)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#1E293B] px-3 text-xs text-slate-200 hover:bg-white/5"
            >
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </button>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-xs text-gray-500">For BIR/DOLE audits — every recorded payment, receipt, and employee confirmation across your payroll history.</p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1E293B] text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="pb-2 pr-4">Month</th>
                    <th className="pb-2 pr-4">Employee</th>
                    <th className="pb-2 pr-4">Amount</th>
                    <th className="pb-2 pr-4">Ref / Note</th>
                    <th className="pb-2 pr-4">Receipt</th>
                    <th className="pb-2 pr-4">Paid At</th>
                    <th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map((r, i) => (
                    <tr key={`${r.runId}-${i}`} className="border-b border-[#1E293B]/60 last:border-0">
                      <td className="py-2 pr-4 text-white">{r.month}</td>
                      <td className="py-2 pr-4 text-gray-300">{r.staffName}</td>
                      <td className="py-2 pr-4 text-gray-300">{r.amount !== null ? PESO(r.amount) : "—"}</td>
                      <td className="py-2 pr-4 text-gray-300">{r.gcashRef ?? r.note ?? "—"}</td>
                      <td className="py-2 pr-4">
                        {r.receiptUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={r.receiptUrl} alt="Receipt" className="h-8 w-8 rounded border border-[#1E293B] object-cover" />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="py-2 pr-4 text-gray-300">
                        {r.paidAt ? new Date(r.paidAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila", month: "short", day: "numeric" }) : "—"}
                      </td>
                      <td className="py-2">
                        <PaymentStatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {runs.length >= 1 && <TaxLayaUpsellBanner />}
    </div>
  );
}

const UPSELL_DISMISSED_KEY = "axla_payroll_taxlaya_upsell_dismissed";

/**
 * Cross-sell, not a paywall — Payroll is the entry product here, TaxLaya is
 * the expansion. Only shown once the user has at least one finalized
 * payroll run (a real signal they've gotten value, not just poking around
 * on the free tier), and dismissible forever via localStorage so it never
 * nags a "no thanks" back into view on every visit.
 */
function TaxLayaUpsellBanner() {
  const [dismissed, setDismissed] = useState(() => typeof window !== "undefined" && localStorage.getItem(UPSELL_DISMISSED_KEY) === "1");

  if (dismissed) return null;

  function handleDismiss() {
    localStorage.setItem(UPSELL_DISMISSED_KEY, "1");
    setDismissed(true);
  }

  return (
    <div className="relative rounded-2xl border border-[#00FF88]/20 bg-[#00FF88]/[0.04] p-5">
      <button
        type="button"
        onClick={handleDismiss}
        className="absolute right-3 top-3 text-gray-500 hover:text-gray-300"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
      <p className="pr-6 text-sm font-semibold text-white">Loving Axla Payroll?</p>
      <p className="mt-1 pr-6 text-sm text-gray-400">
        Auto-compute your BIR 2551Q &amp; 1701Q too — same Axla account, no new signup.
      </p>
      <a
        href="/dashboard?utm_source=payroll_upsell"
        className="mt-3 inline-flex items-center gap-1.5 text-sm font-semibold text-[#00FF88] hover:underline"
      >
        Explore TaxLaya →
      </a>
    </div>
  );
}

const BATANGAS_CITY = { lat: 13.7565, lng: 121.0583 };
const LEAFLET_VERSION = "1.9.4";

/**
 * Vanilla Leaflet loaded from a pinned CDN version, not the npm package —
 * avoids the classic webpack-breaks-Leaflet's-default-marker-icon-paths
 * problem entirely, and needs no API key (OpenStreetMap tiles are free).
 * Loaded once and cached on `window.L` if the map picker mounts more than
 * once in a session.
 */
function ShopLocationMap({
  lat,
  lng,
  radius,
  onChange,
}: {
  lat: number;
  lng: number;
  radius: number;
  onChange: (lat: number, lng: number) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const markerRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const circleRef = useRef<any>(null);

  useEffect(() => {
    let cancelled = false;

    async function ensureLeafletLoaded() {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((window as any).L) return;
      await new Promise<void>((resolve, reject) => {
        if (!document.querySelector('link[data-leaflet]')) {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.css`;
          link.setAttribute("data-leaflet", "1");
          document.head.appendChild(link);
        }
        const script = document.createElement("script");
        script.src = `https://unpkg.com/leaflet@${LEAFLET_VERSION}/dist/leaflet.js`;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load map"));
        document.body.appendChild(script);
      });
    }

    ensureLeafletLoaded().then(() => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).L;
      const map = L.map(containerRef.current).setView([lat, lng], 17);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 19,
      }).addTo(map);
      const marker = L.marker([lat, lng], { draggable: true }).addTo(map);
      const circle = L.circle([lat, lng], { radius, color: "#00FF88", fillColor: "#00FF88", fillOpacity: 0.15 }).addTo(map);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      function handleMove(newLat: number, newLng: number) {
        circle.setLatLng([newLat, newLng]);
        onChange(newLat, newLng);
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      marker.on("dragend", () => {
        const pos = marker.getLatLng();
        handleMove(pos.lat, pos.lng);
      });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on("click", (e: any) => {
        marker.setLatLng(e.latlng);
        handleMove(e.latlng.lat, e.latlng.lng);
      });

      mapRef.current = map;
      markerRef.current = marker;
      circleRef.current = circle;
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marker/view follow lat/lng when set programmatically (e.g. "Use My Location"), not on every render.
  useEffect(() => {
    if (markerRef.current && mapRef.current) {
      markerRef.current.setLatLng([lat, lng]);
      circleRef.current?.setLatLng([lat, lng]);
      mapRef.current.setView([lat, lng]);
    }
  }, [lat, lng]);

  useEffect(() => {
    circleRef.current?.setRadius(radius);
  }, [radius]);

  return <div ref={containerRef} className="h-64 w-full rounded-xl border border-[#1E293B]" />;
}

function SettingsTab({ guide }: { guide: string }) {
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [shopName, setShopName] = useState("");
  const [lat, setLat] = useState(BATANGAS_CITY.lat);
  const [lng, setLng] = useState(BATANGAS_CITY.lng);
  const [radius, setRadius] = useState(150);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetch("/api/payroll/shop/settings", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.settings) return;
        const s: ShopSettings = data.settings;
        setSettings(s);
        setShopName(s.shop_name);
        if (s.lat !== null) setLat(s.lat);
        if (s.lng !== null) setLng(s.lng);
        setRadius(s.radius_meters);
      })
      .finally(() => setIsLoading(false));
  }, []);

  function handleUseMyLocation() {
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude);
        setLng(pos.coords.longitude);
      },
      () => toast("Couldn't get your location — check browser permissions."),
    );
  }

  async function handleSave() {
    if (!shopName.trim()) {
      toast("Shop name is required.");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch("/api/payroll/shop/update-location", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, radius, shopName: shopName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Failed to save shop location.");
        return;
      }
      setSettings(data.settings);
      toast("Shop location saved ✅");
    } catch {
      toast("Network error — try again.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card className={PREMIUM_CARD}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-sm font-semibold text-white">Shop Settings</CardTitle>
          <GuideTooltip text={guide} />
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {isLoading ? (
          <div className="h-64 w-full animate-pulse rounded-xl bg-white/5" />
        ) : (
          <>
            <div className="flex items-center justify-between rounded-xl border border-[#00FF88]/20 bg-[#00FF88]/[0.04] px-4 py-3">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wide text-[#00FF88]/70">Today&apos;s Shop Code</p>
                <p className="text-3xl font-black tracking-widest text-[#00FF88]">{settings?.daily_code ?? "····"}</p>
              </div>
              <RefreshCw className="h-5 w-5 text-[#00FF88]/50" />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Shop Name</label>
              <Input value={shopName} onChange={(e) => setShopName(e.target.value)} placeholder="DOUBLE R WATER" className="border-[#1E293B] bg-[#0B121A]" />
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium text-slate-300">Shop Location</label>
                <button
                  type="button"
                  onClick={handleUseMyLocation}
                  className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#1E293B] px-2 text-xs text-slate-200 hover:bg-white/5"
                >
                  <MapPin className="h-3 w-3" />
                  Use My Location
                </button>
              </div>
              <ShopLocationMap
                lat={lat}
                lng={lng}
                radius={radius}
                onChange={(newLat, newLng) => {
                  setLat(newLat);
                  setLng(newLng);
                }}
              />
              <p className="mt-1 text-[11px] text-gray-500">Drag the pin or tap the map to set your shop's exact spot.</p>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label className="text-sm font-medium text-slate-300">Geofence Radius</label>
                <span className="text-sm font-bold text-[#00FF88]">{radius}m</span>
              </div>
              <input
                type="range"
                min={50}
                max={500}
                step={10}
                value={radius}
                onChange={(e) => setRadius(Number(e.target.value))}
                className="w-full accent-[#00FF88]"
              />
              <p className="mt-1 text-[11px] text-gray-500">Clock-ins beyond this radius are flagged for your approval, not blocked.</p>
            </div>

            <Button onClick={handleSave} disabled={isSaving} className="w-full">
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isSaving ? "Saving..." : "Save Shop Location"}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
