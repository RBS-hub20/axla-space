"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { CATEGORY_KEYS } from "@/lib/excel/category-config";

const SHEET_TABS_BY_TEMPLATE: Record<string, string[]> = {
  base: ["Dashboard", "Inventory", "Daily Sales", "Daily Summary", "Restock List", "Utang Tracker", "Monthly Report", "Expenses", "Suppliers", "Yearly Summary"],
  airbnb: ["Dashboard", "Properties", "Reservations", "Calendar", "Guests", "Check-In Out", "Staff", "Cleaning", "Maintenance", "Revenue", "Expenses", "Profit & Loss", "Inventory"],
  barbershop: ["Dashboard", "Customers", "Services", "Appointments", "Chairs", "Sales", "Payroll", "Attendance", "Product Sales", "Membership", "Expenses", "Inventory", "Profit & Loss"],
  carwash: ["Dashboard", "Customers", "Services", "Vehicle Tracker", "Sales", "Inventory", "Water Usage", "Employees", "Expenses", "Profit & Loss", "Membership", "Booking"],
  rental: ["Dashboard", "Units", "Tenants", "Payments", "Invoice", "SOA", "Expenses", "Maintenance", "Profit & Loss", "Contract"],
  pandesal: ["Dashboard", "Areas", "Production", "Pack Converter", "Seller Allocation", "Accountability", "Route Planner"],
};

const TEMPLATE_BY_CATEGORY: Record<string, string> = {
  Pandesal: "pandesal",
  Airbnb: "airbnb",
  "Car Wash": "carwash",
  Barbershop: "barbershop",
  Rental: "rental",
};

function sheetTabsFor(category: string): string[] {
  const template = TEMPLATE_BY_CATEGORY[category] ?? "base";
  return SHEET_TABS_BY_TEMPLATE[template];
}

const PENDING_KEY = "axla_negosyo_pending";
const PAID_KEY = "axla_negosyo_paid";

interface FormSnapshot {
  businessName: string;
  category: string;
  products: string[];
  mayUtang: boolean;
}

/** Splits on both newlines and commas — "Coke, Piattos, Yosi" on one line and one-per-line both work. */
function parseProducts(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function NegosyoCreateFlow() {
  const searchParams = useSearchParams();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [businessName, setBusinessName] = useState("");
  const [category, setCategory] = useState(CATEGORY_KEYS[0]);
  const [productsText, setProductsText] = useState("");
  const [mayUtang, setMayUtang] = useState(true);

  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [cancelledNotice, setCancelledNotice] = useState(false);

  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [downloadedOk, setDownloadedOk] = useState(false);
  const [pendingCheckoutId, setPendingCheckoutId] = useState<string | null>(null);

  const restoredRef = useRef(false);

  const applySnapshot = useCallback((snapshot: FormSnapshot) => {
    setBusinessName(snapshot.businessName);
    setCategory(snapshot.category);
    setProductsText(snapshot.products.join("\n"));
    setMayUtang(snapshot.mayUtang);
  }, []);

  const verifyAndDownload = useCallback(async (checkoutSessionId: string, snapshot: FormSnapshot) => {
    setVerifying(true);
    setVerifyError(null);
    try {
      const res = await fetch("/api/negosyo-tracker/download", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutSessionId, ...snapshot }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setVerifyError(data.error || "Hindi pa nakumpirma ang bayad. I-try ulit pagkatapos magbayad.");
        setVerifying(false);
        return;
      }
      const blob = await res.blob();
      const safeName = snapshot.businessName.replace(/[^a-zA-Z0-9\s_-]/g, "").trim().replace(/\s+/g, "_") || "Negosyo";
      triggerBlobDownload(blob, `${safeName}_Negosyo_Tracker_Axla.xlsx`);
      localStorage.setItem(PAID_KEY, JSON.stringify({ checkoutSessionId, snapshot }));
      localStorage.removeItem(PENDING_KEY);
      setDownloadedOk(true);
      setStep(3);
    } catch {
      setVerifyError("Network error. I-try ulit.");
    } finally {
      setVerifying(false);
    }
  }, []);

  // Runs once on mount: restore a paid session (re-download), or resume a
  // pending one after returning from PayMongo's hosted checkout page.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;

    if (searchParams.get("cancelled") === "1") {
      setCancelledNotice(true);
      setStep(3);
    }

    const paidRaw = localStorage.getItem(PAID_KEY);
    if (paidRaw) {
      try {
        const { checkoutSessionId, snapshot } = JSON.parse(paidRaw) as { checkoutSessionId: string; snapshot: FormSnapshot };
        applySnapshot(snapshot);
        setPendingCheckoutId(checkoutSessionId);
        setDownloadedOk(true);
        setStep(3);
        return;
      } catch {
        localStorage.removeItem(PAID_KEY);
      }
    }

    if (searchParams.get("paid") === "1") {
      const pendingRaw = localStorage.getItem(PENDING_KEY);
      if (!pendingRaw) {
        setVerifyError("Hindi mahanap ang iyong impormasyon. Pakisimulan ulit ang form.");
        return;
      }
      try {
        const { checkoutSessionId, snapshot } = JSON.parse(pendingRaw) as { checkoutSessionId: string; snapshot: FormSnapshot };
        applySnapshot(snapshot);
        setPendingCheckoutId(checkoutSessionId);
        setStep(3);
        void verifyAndDownload(checkoutSessionId, snapshot);
      } catch {
        localStorage.removeItem(PENDING_KEY);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handlePayClick() {
    setPaying(true);
    setPayError(null);
    const products = parseProducts(productsText);
    const snapshot: FormSnapshot = { businessName: businessName.trim(), category, products, mayUtang };

    try {
      const res = await fetch("/api/paymongo/create-negosyo-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessName: snapshot.businessName }),
      });
      const data = await res.json();
      if (!res.ok || !data.checkoutUrl) {
        setPayError(data.error || "Couldn't start checkout. Please try again.");
        setPaying(false);
        return;
      }
      localStorage.setItem(PENDING_KEY, JSON.stringify({ checkoutSessionId: data.checkoutSessionId, snapshot }));
      window.location.href = data.checkoutUrl;
    } catch {
      setPayError("Network error. I-try ulit.");
      setPaying(false);
    }
  }

  const products = parseProducts(productsText);
  const canProceedStep1 = businessName.trim().length > 0;
  const canProceedStep2 = products.length > 0;
  const sheetTabs = sheetTabsFor(category);

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      {/* Progress bar */}
      <div className="mb-10 flex items-center justify-center gap-3">
        {(["Business", "Negosyo", "Preview"] as const).map((label, i) => {
          const idx = (i + 1) as 1 | 2 | 3;
          const active = step === idx;
          const done = step > idx;
          return (
            <div key={label} className="flex items-center gap-3">
              <div className="flex flex-col items-center gap-1.5">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold transition ${
                    active || done ? "bg-[#00FF88] text-black" : "border border-white/15 text-slate-500"
                  }`}
                >
                  {idx}
                </div>
                <span className={`text-xs font-medium ${active ? "text-white" : "text-slate-500"}`}>{label}</span>
              </div>
              {idx < 3 && <div className={`h-px w-8 sm:w-16 ${step > idx ? "bg-[#00FF88]" : "bg-white/10"}`} />}
            </div>
          );
        })}
      </div>

      {step === 1 && (
        <div className="space-y-6">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-white">
              Business Name <span className="text-red-400">*</span>
            </label>
            <input
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              placeholder="Hal: Aling Nena Sari-Sari Store"
              className="w-full rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3 text-white placeholder:text-slate-500 focus:border-[#00FF88] focus:outline-none"
            />
          </div>

          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4 text-sm text-slate-400">
            Fixed na ang branding — logo at kulay ng Negosyo Tracker PH mismo ang gagamitin, para consistent at professional-looking lagi ang tracker mo.
          </div>

          <button
            disabled={!canProceedStep1}
            onClick={() => setStep(2)}
            className="w-full rounded-full bg-[#00FF88] px-6 py-3.5 text-base font-semibold text-black transition hover:bg-[#22C55E] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Next: Negosyo →
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-6">
          <div>
            <label className="mb-1.5 block text-sm font-semibold text-white">Kategorya</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-xl border border-white/15 bg-[#11172A] px-4 py-3 text-white focus:border-[#00FF88] focus:outline-none"
            >
              {CATEGORY_KEYS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-white">Mga Produkto</label>
            <textarea
              value={productsText}
              onChange={(e) => setProductsText(e.target.value)}
              placeholder={"Hal: Coke, Piattos, Yosi - 1 per line o comma-separated"}
              rows={6}
              className="w-full rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3 text-white placeholder:text-slate-500 focus:border-[#00FF88] focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-500">{products.length} produkto (1 per line o comma-separated, max 20)</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-white">May Utang ba ang negosyo mo?</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMayUtang(true)}
                className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                  mayUtang ? "border-[#00FF88] bg-[#00FF88]/10 text-[#00FF88]" : "border-white/15 text-slate-400"
                }`}
              >
                Oo
              </button>
              <button
                type="button"
                onClick={() => setMayUtang(false)}
                className={`flex-1 rounded-xl border px-4 py-2.5 text-sm font-semibold transition ${
                  !mayUtang ? "border-[#00FF88] bg-[#00FF88]/10 text-[#00FF88]" : "border-white/15 text-slate-400"
                }`}
              >
                Hindi
              </button>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setStep(1)}
              className="flex-1 rounded-full border border-white/15 px-6 py-3.5 text-base font-medium text-white transition hover:bg-white/5"
            >
              ← Back
            </button>
            <button
              disabled={!canProceedStep2}
              onClick={() => setStep(3)}
              className="flex-1 rounded-full bg-[#00FF88] px-6 py-3.5 text-base font-semibold text-black transition hover:bg-[#22C55E] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Preview →
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6">
          {cancelledNotice && !downloadedOk && (
            <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-3 text-sm text-amber-300">
              Kinansela ang bayad. Pwede mo ulit tapusin sa ibaba.
            </div>
          )}

          {downloadedOk ? (
            <div className="space-y-5 rounded-2xl border border-[#00FF88]/30 bg-[#00FF88]/[0.06] p-6 text-center">
              <p className="text-2xl">✅</p>
              <h2 className="text-xl font-bold text-white">Downloaded! I-download ulit anytime</h2>
              <p className="text-sm text-slate-400">Naka-save na ang tracker mo — click ulit sa button sa ibaba kung kailangan mo ulit i-download.</p>
              <button
                onClick={() => pendingCheckoutId && verifyAndDownload(pendingCheckoutId, { businessName, category, products, mayUtang })}
                disabled={verifying}
                className="w-full rounded-full bg-[#00FF88] px-6 py-3 text-sm font-semibold text-black transition hover:bg-[#22C55E] disabled:opacity-50"
              >
                {verifying ? "Downloading..." : "I-download ulit"}
              </button>
              <div className="border-t border-white/10 pt-4">
                <p className="text-sm text-slate-400">
                  Auto-compute BIR?{" "}
                  <Link href="/" className="font-semibold text-[#00FF88] hover:underline">
                    Try TaxLaya →
                  </Link>
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                <div
                  className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden select-none"
                  aria-hidden
                >
                  <span className="rotate-[-30deg] whitespace-nowrap text-2xl font-extrabold text-white/[0.06]">
                    PREVIEW — BAYAD ₱149 PARA MA-DOWNLOAD
                  </span>
                </div>

                <div className="relative flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/negosyo-tracker-logo.png" alt="Negosyo Tracker PH" className="h-12 w-12 rounded-xl object-cover" />
                  <div>
                    <h3 className="font-bold text-white">{businessName || "Aking Negosyo"}</h3>
                    <p className="text-xs text-slate-400">{category}</p>
                  </div>
                </div>

                <p className="relative mt-4 text-sm text-slate-400">
                  {products.length} produkto: {products.slice(0, 5).join(", ")}
                  {products.length > 5 ? `, +${products.length - 5} pa` : ""}
                </p>
                <p className="relative mt-1 text-sm text-slate-400">Utang tracking: {mayUtang ? "Oo" : "Hindi"}</p>

                <div className="relative mt-4 flex flex-wrap gap-1.5">
                  {sheetTabs.map((tab) => (
                    <span
                      key={tab}
                      className="rounded-t-md border border-b-0 border-t-2 border-[#00FF88] border-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-400"
                    >
                      {tab}
                    </span>
                  ))}
                </div>
              </div>

              {verifyError && <div className="rounded-xl border border-red-400/30 bg-red-400/[0.06] p-3 text-sm text-red-300">{verifyError}</div>}
              {payError && <div className="rounded-xl border border-red-400/30 bg-red-400/[0.06] p-3 text-sm text-red-300">{payError}</div>}

              <div className="flex gap-3">
                <button
                  onClick={() => setStep(2)}
                  className="flex-1 rounded-full border border-white/15 px-6 py-3.5 text-base font-medium text-white transition hover:bg-white/5"
                >
                  ← Back
                </button>
                <button
                  onClick={handlePayClick}
                  disabled={paying || verifying}
                  className="flex-1 rounded-full bg-[#00FF88] px-6 py-3.5 text-base font-semibold text-black transition hover:bg-[#22C55E] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {paying ? "Loading..." : verifying ? "Kinukumpirma..." : "I-download - ₱149 lang"}
                </button>
              </div>

              {pendingCheckoutId && verifyError && (
                <button
                  onClick={() => verifyAndDownload(pendingCheckoutId, { businessName, category, products, mayUtang })}
                  disabled={verifying}
                  className="w-full rounded-full border border-[#00FF88]/40 px-6 py-3 text-sm font-semibold text-[#00FF88] transition hover:bg-[#00FF88]/10 disabled:opacity-50"
                >
                  {verifying ? "Kinukumpirma..." : "Nakabayad na ako"}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
