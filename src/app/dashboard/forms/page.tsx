"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Download,
  CheckCircle2,
  Plus,
  AlertTriangle,
  UserCircle,
  FileText,
  Lightbulb,
  Upload,
  Zap,
  FileCode2,
  X,
  Lock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { UpgradeWallModal } from "@/components/dashboard/UpgradeWallModal";
import { Bir2551QPaperPreview } from "@/components/dashboard/Bir2551QPaperPreview";
import { BirFilingsHistory, type BirFiling } from "@/components/dashboard/BirFilingsHistory";
import { ConfettiBurst } from "@/components/dashboard/ConfettiBurst";
import { PLAN_PRICING } from "@/lib/plans";
import { PROMO, isPromoActive } from "@/lib/promo";
import type { UsageType } from "@/lib/usage";

interface BirForm {
  id: string;
  form_type: string;
  status: "draft" | "filed";
  created_at: string;
  filed_at: string | null;
  quarter: number;
  year: number;
  quarter_label: string;
  deadline: string;
  is_overdue: boolean;
}

interface Profile {
  full_name: string | null;
  tin_number: string | null;
  rdo_code: string | null;
  address: string | null;
}

interface ExportResult {
  fileName: string;
  xmlContent?: string;
  datContent?: string;
}

interface QuickCalcResult {
  taxDue: number;
  quarter: number;
  deadline: string;
  breakdown: string[];
}

interface QuarterSum {
  quarter: number;
  year: number;
  status: "draft" | "finalized";
  gross: number;
  count: number;
  finalized: { id: string; gross: number; tax_due: number; finalized_at: string } | null;
}

const FORM_TYPES = [
  { value: "2551Q", label: "2551Q — Percentage Tax (Quarterly)" },
  { value: "1701Q", label: "1701Q — Income Tax (Quarterly)" },
  { value: "0619E", label: "0619E — Withholding Tax (Expanded)" },
];

const PREMIUM_CARD = "rounded-2xl border-[#1E293B] bg-[#121A22] shadow-sm transition hover:border-[#22c55e]/30 hover:shadow-lg hover:shadow-green-500/10";
const CURRENT_QUARTER = (Math.floor(new Date().getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
const CURRENT_YEAR = new Date().getFullYear();
const GCASH_INCOME_STORAGE_KEY = "last_gcash_income";
const PESO = (n: number) => `₱${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function formatTin(tin: string | null): string {
  if (!tin) return "Not set";
  const digits = tin.replace(/\D/g, "");
  if (digits.length < 9) return tin;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}${digits.length > 9 ? "-" + digits.slice(9) : ""}`;
}

function rdoShort(rdo: string | null): string {
  if (!rdo) return "Not set";
  return `RDO ${rdo.split(" - ")[0]}`;
}

function FormsSkeleton() {
  return (
    <div className="grid gap-3">
      {Array.from({ length: 2 }).map((_, i) => (
        <div key={i} className={`${PREMIUM_CARD} p-5`}>
          <div className="h-4 w-40 animate-pulse rounded bg-white/5" />
          <div className="mt-3 h-3 w-64 animate-pulse rounded bg-white/5" />
          <div className="mt-2 h-3 w-48 animate-pulse rounded bg-white/5" />
        </div>
      ))}
    </div>
  );
}

export default function BirFormsPage() {
  const [forms, setForms] = useState<BirForm[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [creatingType, setCreatingType] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [upgradeWall, setUpgradeWall] = useState<{ type: UsageType; message: string } | null>(null);

  // Quick 2551Q preview — a scratch calculator + PDF, separate from the real
  // filing list below. Doesn't touch bir_forms, doesn't consume filing quota.
  const [previewGross, setPreviewGross] = useState("");
  const [previewName, setPreviewName] = useState("");
  const [previewTin, setPreviewTin] = useState("");
  const [previewRdoCode, setPreviewRdoCode] = useState("");
  const [previewAddress, setPreviewAddress] = useState("");
  const [previewQuarter, setPreviewQuarter] = useState<1 | 2 | 3 | 4>(CURRENT_QUARTER);
  const [previewTaxRate, setPreviewTaxRate] = useState<0.03 | 0.08>(0.03);
  const [previewResult, setPreviewResult] = useState<QuickCalcResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // eBIRForms-style XML/DAT export — see src/lib/bir/ebirforms-2551q.ts for
  // exactly what this is and isn't (a structured reference export, not a
  // verified eBIRForms import).
  const [exportLoading, setExportLoading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<"xml" | "dat" | "both" | null>(null);

  // PRO paywall for this Export card — reads the SAME plan every usage limit
  // elsewhere in the app already checks (src/lib/usage.ts), via
  // /api/billing/status. Not a separate is_pro flag.
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isPro, setIsPro] = useState<boolean | null>(null);
  const [plan, setPlan] = useState<"free" | "pro" | "business" | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [showProSuccessModal, setShowProSuccessModal] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  const loadBillingStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/billing/status", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setIsPro(Boolean(data.is_pro));
        setPlan(data.plan ?? null);
      }
    } catch {
      // Non-fatal — the paywall just stays up until this succeeds.
    }
  }, []);

  useEffect(() => {
    loadBillingStatus();
  }, [loadBillingStatus]);

  // ?pro=success lands here right after PayMongo's redirect — the webhook
  // that actually activates the subscription can trail the redirect by a
  // couple seconds, so this re-checks status once more shortly after
  // showing the celebration rather than trusting the query param alone.
  useEffect(() => {
    if (searchParams.get("pro") !== "success") return;
    setShowProSuccessModal(true);
    setShowConfetti(true);
    loadBillingStatus();
    const recheck = setTimeout(loadBillingStatus, 4000);
    const stopConfetti = setTimeout(() => setShowConfetti(false), 2600);
    router.replace("/dashboard/forms");
    return () => {
      clearTimeout(recheck);
      clearTimeout(stopConfetti);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  async function handleUnlockPro() {
    setCheckoutError(null);
    setCheckoutLoading(true);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: "pro", ...(isPromoActive() ? { promoCode: PROMO.code } : {}) }),
      });
      const data = await res.json();

      // Belt-and-suspenders: if isPro hadn't loaded/refreshed yet and the
      // server finds the user is already pro/business, don't send them to
      // checkout for a redundant subscription — just correct the badge.
      if (data.alreadyPro) {
        setIsPro(true);
        setPlan(data.plan ?? "pro");
        return;
      }

      if (!res.ok || !data.checkoutUrl) {
        setCheckoutError(data.error || "Couldn't start checkout.");
        return;
      }
      window.location.href = data.checkoutUrl;
    } catch {
      setCheckoutError("Network error. Please try again.");
      setCheckoutLoading(false);
    }
  }

  // Whether previewGross came from real GCash data, and what that original
  // value was — the badge only reads "Auto-calculated" while the input
  // still matches what was actually auto-filled; editing it is a draft again.
  const [autoFilledIncome, setAutoFilledIncome] = useState<number | null>(null);
  const [incomeLoading, setIncomeLoading] = useState(true);
  const [showManualEntry, setShowManualEntry] = useState(false);

  const grossIncomeNum = Number(previewGross) || 0;
  const isAutoCalculated = autoFilledIncome !== null && autoFilledIncome > 0 && grossIncomeNum === autoFilledIncome;
  const hasIncomeData = (autoFilledIncome ?? 0) > 0;
  const liveTaxDue = useMemo(() => Math.round(grossIncomeNum * previewTaxRate * 100) / 100, [grossIncomeNum, previewTaxRate]);

  // Profile arrives after this effect via loadAll() — sync it into the
  // editable preview fields once, without clobbering further user edits.
  useEffect(() => {
    if (profile?.full_name && !previewName) setPreviewName(profile.full_name);
    if (profile?.tin_number && !previewTin) setPreviewTin(profile.tin_number);
    if (profile?.rdo_code && !previewRdoCode) setPreviewRdoCode(profile.rdo_code);
    if (profile?.address && !previewAddress) setPreviewAddress(profile.address);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  // Auto-fill gross income: localStorage first (instant), then the real
  // /api/dashboard/transactions total (authoritative) once it lands.
  useEffect(() => {
    const cached = Number(localStorage.getItem(GCASH_INCOME_STORAGE_KEY));
    if (Number.isFinite(cached) && cached > 0) {
      setPreviewGross(String(cached));
      setAutoFilledIncome(cached);
    }

    (async () => {
      try {
        const res = await fetch("/api/dashboard/transactions", { cache: "no-store" });
        const data = await res.json();
        if (res.ok && Number.isFinite(data.totalIncome) && data.totalIncome > 0) {
          setPreviewGross(String(data.totalIncome));
          setAutoFilledIncome(data.totalIncome);
          localStorage.setItem(GCASH_INCOME_STORAGE_KEY, String(data.totalIncome));
        }
      } catch {
        // Non-fatal — the manual/localStorage path still works without this.
      } finally {
        setIncomeLoading(false);
      }
    })();
  }, []);

  // Deadline only depends on quarter/year, not on income — fetch it as soon
  // as the quarter is known (on mount, and whenever the quarter changes) so
  // the TaxLaya tip has a real deadline without waiting on a manual click.
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/bir/2551q/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ grossIncome: grossIncomeNum, quarter: previewQuarter, taxRate: previewTaxRate }),
        });
        const data = await res.json();
        if (res.ok) setPreviewResult(data);
      } catch {
        // Non-fatal — the live client-side tax-due figure still works without a deadline.
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    })();
  }, [previewQuarter, previewTaxRate]);

  // Current-quarter draft/finalized total — a real aggregate (SUM, not a
  // full transaction fetch) via /api/dashboard/transactions?sum=true, kept
  // in localStorage so switching back to this quarter or reopening the tab
  // shows a number instantly, then revalidated (fresh fetch on mount, on
  // quarter change, and again whenever the window regains focus — catches
  // uploads made in another tab).
  const [quarterSum, setQuarterSum] = useState<QuarterSum | null>(null);
  const [quarterSumLoading, setQuarterSumLoading] = useState(true);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);
  const [filings, setFilings] = useState<BirFiling[]>([]);
  const [filingsLoading, setFilingsLoading] = useState(true);

  const quarterSumCacheKey = `bir_quarter_sum_${CURRENT_YEAR}_${previewQuarter}`;

  const loadQuarterSum = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/dashboard/transactions?sum=true&quarter=${previewQuarter}&year=${CURRENT_YEAR}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      if (res.ok) {
        setQuarterSum(data);
        localStorage.setItem(quarterSumCacheKey, JSON.stringify(data));
      }
    } catch {
      // Non-fatal — the cached figure (if any) stays on screen.
    } finally {
      setQuarterSumLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewQuarter, quarterSumCacheKey]);

  const loadFilings = useCallback(async () => {
    setFilingsLoading(true);
    try {
      const res = await fetch("/api/bir/2551q/filings", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setFilings(data.filings);
    } finally {
      setFilingsLoading(false);
    }
  }, []);

  useEffect(() => {
    const cached = localStorage.getItem(quarterSumCacheKey);
    if (cached) {
      try {
        setQuarterSum(JSON.parse(cached));
        setQuarterSumLoading(false);
      } catch {
        // Corrupt cache entry — ignore, the fresh fetch below still runs.
      }
    }
    loadQuarterSum();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewQuarter]);

  useEffect(() => {
    loadFilings();
  }, [loadFilings]);

  useEffect(() => {
    function onFocus() {
      loadQuarterSum();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loadQuarterSum]);

  async function handleFinalize() {
    setFinalizeError(null);
    setFinalizing(true);
    try {
      const res = await fetch("/api/bir/2551q/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quarter: previewQuarter, year: CURRENT_YEAR }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFinalizeError(data.error || "Failed to finalize this quarter.");
        return;
      }

      const { generate2551QPDF } = await import("@/lib/pdf/generate-2551q");
      const blob = generate2551QPDF({
        name: previewName || "Not set",
        tin: previewTin || "",
        quarter: previewQuarter,
        gross: data.gross,
        taxDue: data.taxDue,
        date: new Date().toISOString(),
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `2551Q-Q${previewQuarter}-${CURRENT_YEAR}-final.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      await Promise.all([loadQuarterSum(), loadFilings()]);
    } catch {
      setFinalizeError("Network error. Please try again.");
    } finally {
      setFinalizing(false);
    }
  }

  async function handleViewFilingPdf(filing: BirFiling) {
    const { generate2551QPDF } = await import("@/lib/pdf/generate-2551q");
    const blob = generate2551QPDF({
      name: previewName || "Not set",
      tin: previewTin || "",
      quarter: filing.quarter,
      gross: filing.gross,
      taxDue: filing.tax_due,
      date: filing.finalized_at,
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `2551Q-Q${filing.quarter}-${filing.year}-final.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const [formsRes, profileRes] = await Promise.all([
        fetch("/api/dashboard/forms", { cache: "no-store" }),
        fetch("/api/dashboard/profile", { cache: "no-store" }),
      ]);
      const formsData = await formsRes.json();
      const profileData = await profileRes.json();

      if (!formsRes.ok) {
        setError(formsData.error || "Failed to load forms.");
        return;
      }
      setForms(formsData.forms);
      if (profileRes.ok) setProfile(profileData.profile);
    } catch {
      setError("Network error loading forms.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function handleQuickCalculate(e: React.FormEvent) {
    e.preventDefault();
    setPreviewError(null);
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/bir/2551q/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grossIncome: grossIncomeNum, quarter: previewQuarter, taxRate: previewTaxRate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPreviewError(data.error || "Something went wrong.");
        return;
      }
      setPreviewResult(data);
    } catch {
      setPreviewError("Network error. Please try again.");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleDownloadPreviewPdf() {
    // Dynamically imported — jsPDF is a fairly large client bundle, and this
    // is the only place on the page that needs it, only on click.
    const { generate2551QPDF } = await import("@/lib/pdf/generate-2551q");
    const blob = generate2551QPDF({
      name: previewName || "Not set",
      tin: previewTin || "",
      quarter: previewQuarter,
      gross: grossIncomeNum,
      taxDue: previewResult?.taxDue ?? liveTaxDue,
      date: new Date().toISOString(),
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `2551Q-preview-Q${previewQuarter}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  function downloadTextFile(content: string, fileName: string) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  async function handleExport(format: "xml" | "dat" | "both") {
    setExportError(null);
    setExportLoading(true);
    try {
      const res = await fetch("/api/bir/2551q/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tin: previewTin,
          rdoCode: previewRdoCode,
          name: previewName,
          address: previewAddress,
          gross: grossIncomeNum,
          quarter: previewQuarter,
          year: CURRENT_YEAR,
          format,
        }),
      });
      const data: ExportResult & { error?: string } = await res.json();
      if (!res.ok) {
        setExportError(data.error || "Export failed.");
        return;
      }
      if (data.xmlContent) downloadTextFile(data.xmlContent, `${data.fileName}.xml`);
      if (data.datContent) downloadTextFile(data.datContent, `${data.fileName}.dat`);
      setExportSuccess(format);
    } catch {
      setExportError("Network error. Please try again.");
    } finally {
      setExportLoading(false);
    }
  }

  async function createForm(formType: string) {
    setCreatingType(formType);
    try {
      const res = await fetch("/api/dashboard/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formType }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 && data.code === "LIMIT_REACHED") {
          setIsDialogOpen(false);
          setUpgradeWall({ type: data.type, message: data.message });
          return;
        }
        setError(data.error || "Failed to create form.");
        return;
      }
      setIsDialogOpen(false);
      await loadAll();
    } catch {
      setError("Network error creating form.");
    } finally {
      setCreatingType(null);
    }
  }

  async function markFiled(id: string) {
    setMarkingId(id);
    try {
      const res = await fetch(`/api/dashboard/forms/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "filed" }),
      });
      if (res.ok) await loadAll();
    } finally {
      setMarkingId(null);
    }
  }

  const missingTin = profile && !profile.tin_number;

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#080F14] px-4 py-6 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">BIR Forms</h1>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4" />
                New Form
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Choose a form type</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col gap-2">
                {FORM_TYPES.map((ft) => (
                  <button
                    key={ft.value}
                    onClick={() => createForm(ft.value)}
                    disabled={creatingType !== null}
                    className="rounded-lg border border-[#1E293B] px-4 py-3 text-left text-sm text-slate-200 transition hover:border-[#22c55e]/50 hover:bg-white/5 disabled:opacity-50"
                  >
                    {creatingType === ft.value ? "Creating..." : ft.label}
                  </button>
                ))}
              </div>
              <DialogFooter>
                <p className="text-xs text-slate-500">Auto-fills from your most recent tax calculation, if any.</p>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {missingTin && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm text-amber-300">
            <div className="flex items-center gap-2">
              <UserCircle className="h-4 w-4 shrink-0" />
              Your TIN isn&apos;t set yet — PDFs will show &quot;Not set&quot; until you add it.
            </div>
            <Link href="/dashboard/settings" className="shrink-0 whitespace-nowrap font-medium text-amber-200 underline hover:text-amber-100">
              View Profile
            </Link>
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">{error}</div>
        )}

        {/* Current Quarter Total — the real draft/finalize workflow, backed by a
            server-side SUM, not a full transaction fetch. Distinct from the
            free-form "Quick 2551Q Preview" scratch calculator below it. */}
        <Card className={PREMIUM_CARD}>
          <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
            <CardTitle className="text-sm font-semibold text-white">
              Current Quarter Total — Q{previewQuarter} {CURRENT_YEAR}
            </CardTitle>
            {quarterSum?.finalized ? (
              <Badge variant="success">Finalized</Badge>
            ) : (
              <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-gray-400">
                Draft{quarterSum ? ` · ${quarterSum.count} receipt${quarterSum.count === 1 ? "" : "s"} uploaded` : ""}
              </span>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            {quarterSumLoading && !quarterSum ? (
              <div className="h-16 w-full animate-pulse rounded-xl bg-white/5" />
            ) : !quarterSum || quarterSum.count === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-center">
                <Upload className="h-6 w-6 text-gray-500" />
                <p className="text-sm text-gray-400">Upload GCash to start Q{previewQuarter}</p>
                <Link
                  href="/dashboard/upload"
                  className="mt-1 text-xs font-medium text-[#22c55e] hover:underline"
                >
                  Upload GCash history →
                </Link>
              </div>
            ) : (
              <>
                <div className="rounded-xl border border-[#1E293B] bg-white/[0.02] p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-300">
                      {quarterSum.finalized ? "Finalized gross" : "Draft gross (income only)"}
                    </span>
                    <span className="text-2xl font-bold text-[#22c55e]">
                      {PESO(quarterSum.finalized ? quarterSum.finalized.gross : quarterSum.gross)}
                    </span>
                  </div>
                  {quarterSum.finalized && (
                    <p className="mt-1 text-xs text-gray-500">
                      Tax due {PESO(quarterSum.finalized.tax_due)} · finalized{" "}
                      {new Date(quarterSum.finalized.finalized_at).toLocaleDateString("en-PH", {
                        month: "long",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  )}
                </div>

                {finalizeError && (
                  <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                    {finalizeError}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <Link
                    href="/dashboard/upload"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#1E293B] px-4 py-2 text-sm font-medium text-slate-200 hover:bg-white/5"
                  >
                    ➕ Add More Receipts
                  </Link>
                  {!quarterSum.finalized && (
                    <Button
                      type="button"
                      onClick={handleFinalize}
                      disabled={finalizing}
                      className="bg-[#22c55e] text-[#001A29] shadow-lg shadow-green-500/20 hover:bg-[#1fb854] hover:shadow-green-500/40"
                    >
                      <Lock className="h-3.5 w-3.5" />
                      {finalizing ? "Finalizing..." : "Finalize & Generate BIR PDF"}
                    </Button>
                  )}
                </div>
                {!quarterSum.finalized && (
                  <p className="text-xs text-gray-500">
                    Finalizing locks this quarter&apos;s current draft total into one filing and downloads the BIR
                    PDF. New uploads after that still save as drafts — they just won&apos;t retroactively change
                    what was already finalized.
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Filing History</h2>
          <BirFilingsHistory filings={filings} isLoading={filingsLoading} onViewPdf={handleViewFilingPdf} />
        </div>

        {/* Quick 2551Q Preview — instant, unofficial, no filing quota used */}
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Quick 2551Q Preview</h2>
          {isAutoCalculated ? (
            <span className="flex items-center gap-1 rounded-full bg-[#22c55e]/10 px-2.5 py-1 text-xs font-semibold text-[#22c55e]">
              <Zap className="h-3 w-3" />
              Auto-calculated
            </span>
          ) : (
            <span className="rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium text-gray-400">Draft</span>
          )}
        </div>

        {incomeLoading ? (
          <div className={`${PREMIUM_CARD} p-6`}>
            <div className="h-4 w-48 animate-pulse rounded bg-white/5" />
            <div className="mt-4 h-32 w-full animate-pulse rounded-xl bg-white/5" />
          </div>
        ) : !hasIncomeData && !showManualEntry ? (
          <Card className={PREMIUM_CARD}>
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/5">
                <Upload className="h-6 w-6 text-gray-500" />
              </span>
              <p className="text-sm font-semibold text-white">No income data yet</p>
              <p className="max-w-sm text-xs text-gray-500">
                Upload your GCash transaction history and Axla will auto-fill your gross income here.
              </p>
              <div className="flex flex-wrap justify-center gap-2 pt-1">
                <Link
                  href="/dashboard/upload"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[#22c55e] px-4 py-2 text-sm font-semibold text-[#001A29] transition hover:bg-[#1fb854]"
                >
                  Upload GCash history
                  <span aria-hidden>→</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setShowManualEntry(true)}
                  className="rounded-lg border border-[#1E293B] px-4 py-2 text-sm font-medium text-gray-300 hover:bg-white/5"
                >
                  Enter manually instead
                </button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 lg:grid-cols-5">
            <div className="space-y-4 lg:col-span-2">
              <Card className={PREMIUM_CARD}>
                <CardContent className="space-y-4 pt-5">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-300">Full Name</label>
                    <Input
                      value={previewName}
                      onChange={(e) => setPreviewName(e.target.value)}
                      placeholder="Juan Dela Cruz"
                      className="border-[#1E293B] bg-[#0B121A]"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-300">TIN</label>
                      <Input
                        value={previewTin}
                        onChange={(e) => setPreviewTin(e.target.value)}
                        placeholder="000-000-000-000"
                        className="border-[#1E293B] bg-[#0B121A]"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium text-slate-300">RDO Code</label>
                      <Input
                        value={previewRdoCode}
                        onChange={(e) => setPreviewRdoCode(e.target.value)}
                        placeholder="e.g. 044"
                        className="border-[#1E293B] bg-[#0B121A]"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-300">Address</label>
                    <Input
                      value={previewAddress}
                      onChange={(e) => setPreviewAddress(e.target.value)}
                      placeholder="Business/registered address"
                      className="border-[#1E293B] bg-[#0B121A]"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-300">Quarter ({CURRENT_YEAR})</label>
                    <div className="grid grid-cols-4 gap-1.5">
                      {([1, 2, 3, 4] as const).map((q) => (
                        <button
                          key={q}
                          type="button"
                          onClick={() => setPreviewQuarter(q)}
                          className={`rounded-lg border px-2 py-1.5 text-sm font-semibold transition ${
                            previewQuarter === q
                              ? "border-[#22c55e] bg-[#22c55e]/10 text-[#22c55e]"
                              : "border-[#1E293B] text-slate-300 hover:bg-white/5"
                          }`}
                        >
                          Q{q}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-300">Gross Income</label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={previewGross}
                      onChange={(e) => setPreviewGross(e.target.value)}
                      placeholder="e.g. 100000"
                      className="border-[#1E293B] bg-[#0B121A]"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-300">Tax Rate</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {([0.03, 0.08] as const).map((rate) => (
                        <button
                          key={rate}
                          type="button"
                          onClick={() => setPreviewTaxRate(rate)}
                          className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                            previewTaxRate === rate
                              ? "border-[#22c55e] bg-[#22c55e]/10 text-[#22c55e]"
                              : "border-[#1E293B] text-slate-300 hover:bg-white/5"
                          }`}
                        >
                          {(rate * 100).toFixed(0)}%
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-[#1E293B] bg-white/[0.02] p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-300">Tax due (live)</span>
                      <span className="text-xl font-bold text-[#22c55e]">{PESO(liveTaxDue)}</span>
                    </div>
                    {previewResult && (
                      <p className="mt-1 text-xs text-gray-500">
                        Deadline:{" "}
                        {new Date(previewResult.deadline).toLocaleDateString("en-PH", {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                    )}
                  </div>

                  {previewError && (
                    <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                      {previewError}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button type="button" onClick={handleQuickCalculate} disabled={previewLoading} className="flex-1">
                      {previewLoading ? "Calculating..." : "Calculate"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={grossIncomeNum <= 0}
                      onClick={handleDownloadPreviewPdf}
                      className="flex-1 border-[#22c55e]/30 text-[#22c55e] hover:bg-[#22c55e]/10 hover:shadow-lg hover:shadow-green-500/10"
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download BIR PDF
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Rough estimate only — doesn&apos;t save anything or count against your plan. Use &quot;New
                    Form&quot; above for a real, trackable filing.
                  </p>
                </CardContent>
              </Card>

              {previewResult &&
                (() => {
                  const deadlineDate = new Date(previewResult.deadline);
                  const daysLeft = Math.max(0, Math.ceil((deadlineDate.getTime() - Date.now()) / 86_400_000));
                  return (
                    <Card className={PREMIUM_CARD}>
                      <CardContent className="flex items-start gap-2 pt-5">
                        <Lightbulb className="h-4 w-4 shrink-0 text-[#22c55e]" />
                        <p className="text-xs text-gray-400">
                          <span className="font-medium text-gray-300">TaxLaya tip:</span> Based on your GCash income{" "}
                          {PESO(grossIncomeNum)}, your tax is {PESO(liveTaxDue)}. Due{" "}
                          {deadlineDate.toLocaleDateString("en-PH", { month: "long", day: "numeric" })} — {daysLeft} day
                          {daysLeft === 1 ? "" : "s"} left.
                        </p>
                      </CardContent>
                    </Card>
                  );
                })()}
            </div>

            <div className="lg:col-span-3">
              <Bir2551QPaperPreview
                name={previewName}
                tin={previewTin}
                quarter={previewQuarter}
                year={CURRENT_YEAR}
                gross={grossIncomeNum}
                taxRate={previewTaxRate}
                taxDue={liveTaxDue}
                date={new Date()}
              />
            </div>
          </div>
        )}

        {!incomeLoading && (hasIncomeData || showManualEntry) && (
          <div className="relative">
            <Card className={PREMIUM_CARD}>
              <CardHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <FileCode2 className="h-4 w-4 text-[#22c55e]" />
                  <CardTitle className="text-sm font-semibold text-white">Export 2551Q Data</CardTitle>
                  <span className="rounded-full bg-[#22c55e]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#22c55e]">
                    New
                  </span>
                  {isPro && (
                    <Badge variant="success">
                      {plan === "business" ? "BUSINESS Active ✅" : plan === "pro" ? "PRO Active ✅" : "FREE"}
                    </Badge>
                  )}
                </div>
              </CardHeader>
              <CardContent className={`space-y-4 ${isPro === false ? "pointer-events-none select-none blur-sm" : ""}`}>
                <p className="text-xs text-gray-500">
                  Exports the figures above as portable files — useful as a backup, for your accountant, or to speed up
                  re-typing into the real eBIRForms app. BIR&apos;s eBIRForms desktop app doesn&apos;t publicly document a
                  generic file-import feature, so always re-verify these numbers there before submitting.
                </p>

                {exportError && (
                  <div className="rounded-xl border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                    {exportError}
                  </div>
                )}

                <div className="grid gap-2 sm:grid-cols-3">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={grossIncomeNum <= 0}
                    onClick={handleDownloadPreviewPdf}
                    className="border-[#1E293B]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    BIR Form Preview PDF
                  </Button>

                  <div className="relative">
                    <span className="absolute -top-2 right-2 z-10 animate-pulse rounded-full bg-[#22c55e] px-2 py-0.5 text-[9px] font-bold uppercase text-[#001A29] shadow-lg shadow-green-500/40">
                      Kakaiba to!
                    </span>
                    <Button
                      type="button"
                      disabled={grossIncomeNum <= 0 || exportLoading}
                      onClick={() => handleExport("xml")}
                      className="w-full bg-[#22c55e] text-[#001A29] shadow-lg shadow-green-500/20 hover:bg-[#1fb854] hover:shadow-green-500/40"
                    >
                      <FileCode2 className="h-3.5 w-3.5" />
                      {exportLoading ? "Exporting..." : "eBIRForms Reference (.xml)"}
                    </Button>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    disabled={grossIncomeNum <= 0 || exportLoading}
                    onClick={() => handleExport("dat")}
                    className="border-[#1E293B]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Offline Reference (.dat)
                  </Button>
                </div>

                <div className="rounded-xl border border-[#1E293B] bg-white/[0.02] p-4">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">How to use it</p>
                  <ol className="space-y-1.5 text-xs text-gray-400">
                    <li>1. Download the XML (or DAT) file above.</li>
                    <li>2. Open the real BIR eBIRForms app and pull up Form 2551Q for this quarter.</li>
                    <li>3. Use the file as a reference to fill in — or double-check — each field quickly.</li>
                    <li>4. Let eBIRForms validate the numbers, then submit and pay via your usual channel.</li>
                  </ol>
                </div>
              </CardContent>
            </Card>

            {isPro === false && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[#080F14]/40 p-6 text-center">
                {checkoutError && (
                  <div className="rounded-xl border border-red-900/60 bg-red-950/90 px-3 py-2 text-xs text-red-300">
                    {checkoutError}
                  </div>
                )}
                <Button
                  type="button"
                  onClick={handleUnlockPro}
                  disabled={checkoutLoading}
                  className="bg-[#22c55e] px-6 py-3 text-sm text-[#001A29] shadow-xl shadow-green-500/30 hover:bg-[#1fb854]"
                >
                  <Lock className="h-4 w-4" />
                  {checkoutLoading
                    ? "Opening checkout..."
                    : isPromoActive()
                      ? `Unlock Official BIR PDF — ₱${PROMO.proPricePesos}/mo (50% OFF!)`
                      : `Unlock Official BIR PDF — ₱${PLAN_PRICING.pro.monthly}/mo (PRO)`}
                </Button>
                <p className="max-w-xs text-xs text-gray-400">
                  Unlimited official 2551Q PDF + XML/DAT export + GCash auto-fill. Same PRO plan used across Axla —
                  see{" "}
                  <Link href="/pricing" className="underline hover:text-gray-200">
                    pricing
                  </Link>
                  .
                </p>
              </div>
            )}
          </div>
        )}

        {exportSuccess && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setExportSuccess(null)}>
            <div
              className="w-full max-w-sm rounded-2xl border border-[#1E293B] bg-[#121A22] p-6 text-center shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setExportSuccess(null)}
                className="float-right text-gray-500 hover:text-gray-300"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
              <p className="text-3xl">📄</p>
              <p className="mt-2 text-base font-bold text-white">Export ready!</p>
              <p className="mt-1 text-sm text-gray-400">
                Use this as a reference when filling out the real eBIRForms app — always verify the numbers there
                before submitting.
              </p>
              <Button type="button" onClick={() => setExportSuccess(null)} className="mt-4 w-full">
                Got it
              </Button>
            </div>
          </div>
        )}

        {showConfetti && <ConfettiBurst />}

        {showProSuccessModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            onClick={() => setShowProSuccessModal(false)}
          >
            <div
              className="w-full max-w-sm rounded-2xl border border-[#22c55e]/30 bg-[#121A22] p-6 text-center shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-3xl">🎉</p>
              <p className="mt-2 text-base font-bold text-white">PRO Activated!</p>
              <p className="mt-1 text-sm text-gray-400">
                {isPro
                  ? "You're unlocked — download your official BIR PDF and eBIRForms export now."
                  : "Payment received — this can take a few seconds to activate. Refresh if it's still locked shortly."}
              </p>
              <Button type="button" onClick={() => setShowProSuccessModal(false)} className="mt-4 w-full">
                Download now
              </Button>
            </div>
          </div>
        )}

        {isLoading ? (
          <FormsSkeleton />
        ) : forms.length === 0 ? (
          <Card className={PREMIUM_CARD}>
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <FileText className="h-8 w-8 text-gray-600" />
              <p className="text-sm text-slate-400">
                No forms yet. Click &quot;New Form&quot; to create one — it&apos;ll auto-fill from your latest tax
                calculation.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {forms.map((form) => (
              <Card key={form.id} className={PREMIUM_CARD}>
                <CardHeader className="flex-row items-start justify-between space-y-0">
                  <div>
                    <CardTitle className="text-base text-white">
                      {form.form_type} · {form.quarter_label}
                    </CardTitle>
                    <p className="mt-1 text-xs text-slate-500">{profile?.full_name || "Name not set"}</p>
                    <p className="text-xs text-slate-500">
                      TIN: {formatTin(profile?.tin_number ?? null)} · {rdoShort(profile?.rdo_code ?? null)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <Badge variant={form.status === "filed" ? "success" : "warning"}>
                      {form.status === "filed" ? "Filed" : "Draft"}
                    </Badge>
                    <Badge variant={form.is_overdue ? "destructive" : "default"} className="flex items-center gap-1">
                      {form.is_overdue && <AlertTriangle className="h-3 w-3" />}
                      Due {new Date(form.deadline).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="flex gap-2 pt-0">
                  <a
                    href={`/api/dashboard/forms/${form.id}/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#1E293B] px-3 text-xs font-medium text-slate-200 hover:bg-white/5"
                  >
                    <Download className="h-3.5 w-3.5" />
                    View PDF
                  </a>
                  {form.status === "draft" && (
                    <button
                      onClick={() => markFiled(form.id)}
                      disabled={markingId === form.id}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#22c55e]/30 px-3 text-xs font-medium text-[#22c55e] hover:bg-[#22c55e]/10 disabled:opacity-50"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {markingId === form.id ? "Marking..." : "Mark as filed"}
                    </button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <UpgradeWallModal
          open={Boolean(upgradeWall)}
          onClose={() => setUpgradeWall(null)}
          type={upgradeWall?.type ?? null}
          message={upgradeWall?.message ?? null}
        />
      </div>
    </div>
  );
}
