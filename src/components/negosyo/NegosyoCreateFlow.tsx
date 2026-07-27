"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const CATEGORIES = [
  "Sari-Sari Store",
  "Online Seller",
  "Food Cart",
  "Milktea/Coffee",
  "Ukay/RTW",
  "Bigas/Egg",
  "Carinderia",
  "Bake Shop",
  "GCash/Loading",
  "Beauty Services",
  "Other",
];

const COLOR_PRESETS = [
  { name: "Green", hex: "#00FF88" },
  { name: "Black", hex: "#0B0F1A" },
  { name: "Pink", hex: "#EC4899" },
  { name: "Blue", hex: "#3B82F6" },
  { name: "Yellow", hex: "#EAB308" },
];

const SHEET_TABS = ["Cover", "Dashboard", "Price List", "Benta Log", "Gastos Log", "Inventory", "Utang List", "Buwanang Report"];

const PENDING_KEY = "axla_negosyo_pending";
const PAID_KEY = "axla_negosyo_paid";

interface FormSnapshot {
  businessName: string;
  logoBase64: string | null;
  color1: string;
  color2: string;
  category: string;
  products: string[];
  mayUtang: boolean;
}

function parseProducts(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 20);
}

/** Downscales to at most 300x300 before base64-encoding — keeps the payload small for both the request body and the generated file. */
function readLogoAsResizedBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Couldn't load image."));
      img.onload = () => {
        const maxDim = 300;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const width = Math.round(img.width * scale);
        const height = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas not supported."));
          return;
        }
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL("image/png"));
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  });
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
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [color1, setColor1] = useState("#00FF88");
  const [color2, setColor2] = useState("#0B0F1A");
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [productsText, setProductsText] = useState("");
  const [mayUtang, setMayUtang] = useState(true);

  const [logoError, setLogoError] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [cancelledNotice, setCancelledNotice] = useState(false);

  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [downloadedOk, setDownloadedOk] = useState(false);
  const [pendingCheckoutId, setPendingCheckoutId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const restoredRef = useRef(false);

  const applySnapshot = useCallback((snapshot: FormSnapshot) => {
    setBusinessName(snapshot.businessName);
    setLogoBase64(snapshot.logoBase64);
    setColor1(snapshot.color1);
    setColor2(snapshot.color2);
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

  async function handleLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLogoError("Kailangan image file (PNG/JPG).");
      return;
    }
    if (file.size > 8_000_000) {
      setLogoError("Masyadong malaki ang file (max 8MB).");
      return;
    }
    setLogoError(null);
    try {
      const resized = await readLogoAsResizedBase64(file);
      setLogoBase64(resized);
    } catch {
      setLogoError("Hindi ma-process ang image. Try ulit.");
    }
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file && fileInputRef.current) {
      const dt = new DataTransfer();
      dt.items.add(file);
      fileInputRef.current.files = dt.files;
      handleLogoChange({ target: fileInputRef.current } as React.ChangeEvent<HTMLInputElement>);
    }
  }

  async function handlePayClick() {
    setPaying(true);
    setPayError(null);
    const products = parseProducts(productsText);
    const snapshot: FormSnapshot = { businessName: businessName.trim(), logoBase64, color1, color2, category, products, mayUtang };

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

  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      {/* Progress bar */}
      <div className="mb-10 flex items-center justify-center gap-3">
        {(["Branding", "Negosyo", "Preview"] as const).map((label, i) => {
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

          <div>
            <label className="mb-1.5 block text-sm font-semibold text-white">Logo (optional)</label>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-white/15 bg-white/[0.02] px-4 py-8 text-center transition hover:border-[#00FF88]/50"
            >
              {logoBase64 ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoBase64} alt="Logo preview" className="h-20 w-20 rounded-xl object-cover" />
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLogoBase64(null);
                    }}
                    className="text-xs font-medium text-red-400 hover:text-red-300"
                  >
                    Alisin
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-slate-400">I-drag ang logo dito, o click para mag-browse</p>
                  <p className="text-xs text-slate-600">PNG/JPG, max 8MB</p>
                </>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoChange} className="hidden" />
            </div>
            {logoError && <p className="mt-1.5 text-xs text-red-400">{logoError}</p>}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-white">Kulay 1 (Primary)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color1}
                  onChange={(e) => setColor1(e.target.value)}
                  className="h-10 w-12 cursor-pointer rounded-lg border border-white/15 bg-transparent"
                />
                <div className="flex gap-1">
                  {COLOR_PRESETS.map((p) => (
                    <button
                      key={p.hex}
                      type="button"
                      onClick={() => setColor1(p.hex)}
                      title={p.name}
                      style={{ backgroundColor: p.hex }}
                      className="h-6 w-6 rounded-full border border-white/20"
                    />
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold text-white">Kulay 2 (Secondary)</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={color2}
                  onChange={(e) => setColor2(e.target.value)}
                  className="h-10 w-12 cursor-pointer rounded-lg border border-white/15 bg-transparent"
                />
                <div className="flex gap-1">
                  {COLOR_PRESETS.map((p) => (
                    <button
                      key={p.hex}
                      type="button"
                      onClick={() => setColor2(p.hex)}
                      title={p.name}
                      style={{ backgroundColor: p.hex }}
                      className="h-6 w-6 rounded-full border border-white/20"
                    />
                  ))}
                </div>
              </div>
            </div>
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
              {CATEGORIES.map((c) => (
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
              placeholder={"Hal: Coke, Piattos, Yosi - 1 per line"}
              rows={6}
              className="w-full rounded-xl border border-white/15 bg-white/[0.03] px-4 py-3 text-white placeholder:text-slate-500 focus:border-[#00FF88] focus:outline-none"
            />
            <p className="mt-1 text-xs text-slate-500">{products.length} produkto ({productsText.split("\n").filter((l) => l.trim()).length > 20 ? "max 20 lang gagamitin" : "1 per line"})</p>
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
                onClick={() => pendingCheckoutId && verifyAndDownload(pendingCheckoutId, { businessName, logoBase64, color1, color2, category, products, mayUtang })}
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
                  {logoBase64 ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={logoBase64} alt="Logo" className="h-12 w-12 rounded-xl object-cover" />
                  ) : (
                    <div
                      className="flex h-12 w-12 items-center justify-center rounded-xl text-lg font-bold"
                      style={{ backgroundColor: color1, color: color2 }}
                    >
                      {businessName.slice(0, 1).toUpperCase() || "N"}
                    </div>
                  )}
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
                  {SHEET_TABS.map((tab) => (
                    <span
                      key={tab}
                      className="rounded-t-md border border-b-0 border-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-400"
                      style={{ borderTopColor: color1, borderTopWidth: 2 }}
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
                  onClick={() => verifyAndDownload(pendingCheckoutId, { businessName, logoBase64, color1, color2, category, products, mayUtang })}
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
