"use client";

import { useEffect, useState } from "react";
import { Briefcase, Rocket, Skull, Plane, Landmark, Lock, Loader2, AlertTriangle, Send, Download, Plus, Trash2, Sparkles } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { PLAN_PRICING } from "@/lib/plans";

const PREMIUM_CARD =
  "rounded-2xl border-[#1E293B] bg-[#121A22] shadow-sm transition hover:border-[#22c55e]/30 hover:shadow-lg hover:shadow-green-500/10";
const PESO = (n: number) => `₱${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

type Tab = "open" | "close" | "spa" | "registration";

const REP_RELATIONSHIPS = ["Employee", "Family Member", "Friend", "Other"];

// Real citation, verified: A.M. No. 24-10-14-SC, promulgated Feb 4 2025,
// effective ~March 24 2025 (15 days after March 9 2025 publication). The
// rule accepts electronic documents in "PDF or PDF/A" — PDF/A isn't the
// only accepted format, it's the archival-grade one, which is what our
// generated PDFs now target (embedded fonts + PDF/A identification
// metadata). We don't claim ISO 19005-1 validator-certified conformance
// here (that also needs an ICC output intent we don't have a verified
// profile for) — see toolkit-pdf-helpers.ts's attachPdfAMetadata().
const E_NOTARY_STEPS = [
  { title: "Prepare your PDF/A", desc: "Done automatically — every kit document below is generated with embedded fonts and PDF/A metadata, no extra step needed." },
  { title: "Create an account at an accredited e-Notarization Facility (ENF)", desc: "e.g. NotarioPH, NotarizeIT — accreditation is still rolling out, so check the Supreme Court's official directory (linked below) for who's currently accredited before you pick one." },
  { title: "Video call with an e-Notary Public", desc: "Remote Electronic Notarization (REN) — the e-Notary verifies your ID and witnesses your signature over video, no office visit needed." },
  { title: "Receive your notarized document", desc: "You get back a notarized PDF with a digital seal, ready to submit." },
];
const SC_ENOTARY_URL = "https://sc.judiciary.gov.ph/enotary-services/";

function ENotaryReadyBanner({ docs }: { docs: string[] }) {
  return (
    <div className="space-y-3 rounded-xl border border-[#22c55e]/30 bg-[#22c55e]/[0.06] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-[#22c55e]" />
          <div>
            <p className="text-sm font-bold text-[#22c55e]">NEW: E-Notarization Ready!</p>
            <p className="mt-1 text-sm text-gray-300">
              These documents are generated in an archival PDF/A-oriented format with embedded fonts — the format accepted for
              e-Notarization under the Supreme Court&apos;s 2025 Rules on Electronic Notarization (A.M. No. 24-10-14-SC).
            </p>
          </div>
        </div>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" className="shrink-0 gap-1.5 border-[#22c55e]/40 text-[#22c55e] hover:bg-[#22c55e]/10">
              How to e-Notary Online?
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg border-[#1E293B] bg-[#0B1218]">
            <DialogHeader>
              <DialogTitle>How to e-Notarize Online</DialogTitle>
              <DialogDescription>
                Remote Electronic Notarization under the Supreme Court&apos;s 2025 Rules (A.M. No. 24-10-14-SC) — no in-person notary visit
                needed.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              {E_NOTARY_STEPS.map((s, i) => (
                <div key={s.title} className="flex gap-3">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#22c55e] text-xs font-bold text-black">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">{s.title}</p>
                    <p className="text-xs text-gray-400">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs text-gray-500">
              Accreditation is still rolling out and can change — check the Supreme Court&apos;s official{" "}
              <a href={SC_ENOTARY_URL} target="_blank" rel="noopener noreferrer" className="text-[#22c55e] underline">
                eNotary Services directory
              </a>{" "}
              for the current list of accredited providers.
            </p>
          </DialogContent>
        </Dialog>
      </div>
      {docs.length > 0 && (
        <div className="space-y-1.5">
          {docs.map((d) => (
            <div key={d} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs">
              <span className="text-gray-300">{d}</span>
              <span className="shrink-0 rounded-full bg-[#22c55e]/15 px-2 py-0.5 text-[10px] font-bold text-[#22c55e]">✓ E-Notary Ready</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface ProfilePrefill {
  fullName: string;
  tin: string;
  rdoCode: string;
  businessName: string;
  address: string;
}

function toast(message: string) {
  const el = document.createElement("div");
  el.textContent = message;
  el.className =
    "fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-full bg-[#1E293B] px-4 py-2 text-sm font-medium text-white shadow-lg";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

async function downloadZip(url: string, body: object, filename: string): Promise<{ ok: boolean; error?: string; upgradeRequired?: boolean }> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let data: { error?: string; code?: string } = {};
    try {
      data = await res.json();
    } catch {
      // non-JSON error body — fall through to generic message
    }
    return { ok: false, error: data.error || "Something went wrong.", upgradeRequired: data.code === "UPGRADE_REQUIRED" };
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
  return { ok: true };
}

export default function BusinessToolkitPage() {
  const [tab, setTab] = useState<Tab>("open");
  const [isPro, setIsPro] = useState(false);
  const [isBusiness, setIsBusiness] = useState(false);
  const [planLoaded, setPlanLoaded] = useState(false);
  const [prefill, setPrefill] = useState<ProfilePrefill>({ fullName: "", tin: "", rdoCode: "", businessName: "", address: "" });

  const [openCasesWarning, setOpenCasesWarning] = useState<{ count: number; penalty: number } | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/dashboard/profile");
        const data = await res.json();
        if (data.profile) {
          setPrefill({
            fullName: data.profile.full_name || "",
            tin: data.profile.tin_number || "",
            rdoCode: data.profile.rdo_code || "",
            businessName: data.profile.business_name || "",
            address: data.profile.address || "",
          });
        }
      } catch {
        // Prefill is best-effort — an empty form still works, just needs typing.
      }

    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/billing/status", { cache: "no-store" });
        const data = await res.json();
        setIsPro(Boolean(data.is_pro));
        setIsBusiness(data.plan === "business");
      } finally {
        setPlanLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (tab !== "close") return;
    (async () => {
      try {
        const res = await fetch("/api/bir-guard/cases");
        if (!res.ok) return;
        const data = await res.json();
        const open = (data.cases ?? []).filter((c: { status: string }) => c.status !== "filed");
        if (open.length > 0) {
          const penalty = open.reduce((sum: number, c: { penalty_amount: number }) => sum + Number(c.penalty_amount), 0);
          setOpenCasesWarning({ count: open.length, penalty });
        }
      } catch {
        // BIR Guard pre-check is a courtesy warning, not a hard requirement.
      }
    })();
  }, [tab]);

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#080F14] px-4 py-6 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <Briefcase className="h-6 w-6 text-[#22c55e]" />
          <h1 className="text-2xl font-bold text-white">Business Toolkit</h1>
          <span className="rounded-full bg-[#22c55e]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#22c55e]">
            PRO
          </span>
        </div>

        <div className="flex gap-2 overflow-x-auto rounded-2xl border border-[#1E293B] bg-[#121A22] p-1.5">
          <TabButton active={tab === "open"} onClick={() => setTab("open")} icon={<Rocket className="h-4 w-4" />} label="Open Business" />
          <TabButton active={tab === "close"} onClick={() => setTab("close")} icon={<Skull className="h-4 w-4" />} label="Close Business" />
          <TabButton active={tab === "spa"} onClick={() => setTab("spa")} icon={<Plane className="h-4 w-4" />} label="SPA / OFW" />
          <TabButton
            active={tab === "registration"}
            onClick={() => setTab("registration")}
            icon={<Landmark className="h-4 w-4" />}
            label="DTI / SEC / Mayor's"
          />
        </div>

        {tab === "open" && <OpenTab prefill={prefill} isPro={isPro} planLoaded={planLoaded} />}
        {tab === "close" && <CloseTab prefill={prefill} isPro={isPro} planLoaded={planLoaded} warning={openCasesWarning} />}
        {tab === "spa" && <SpaTab prefill={prefill} isPro={isPro} planLoaded={planLoaded} />}
        {tab === "registration" && <RegistrationTab prefill={prefill} isPro={isPro} isBusiness={isBusiness} planLoaded={planLoaded} />}

        <p className="text-xs text-gray-500">
          Template only — generated documents are AXLA reference sheets, not official government forms (BIR, DTI, or SEC), and are not
          legally binding until properly filed/notarized where applicable. Download the official forms from bir.gov.ph, dti.gov.ph, or
          sec.gov.ph.
        </p>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
        active ? "bg-[#22c55e] text-[#001A0D]" : "text-gray-400 hover:bg-white/5 hover:text-white"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function ProLockOverlay({ price }: { price: string }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[#080F14]/70 p-6 text-center backdrop-blur-[1px]">
      <Lock className="h-8 w-8 text-[#22c55e]" />
      <p className="text-lg font-bold text-white">Unlock PRO {price} to Download</p>
      <p className="max-w-sm text-sm text-gray-400">You can fill out the form for free — downloading the generated documents needs PRO.</p>
      <a
        href="/dashboard/forms"
        className="mt-1 rounded-full bg-[#22c55e] px-5 py-2.5 text-sm font-semibold text-[#001A0D] transition hover:bg-[#16a34a]"
      >
        Unlock PRO {price}
      </a>
    </div>
  );
}

// PLAN_PRICING is the single source of truth for real prices (₱499/mo PRO,
// ₱1,499/mo BUSINESS) — not hardcoded here, so this can't drift from what
// checkout actually charges.
const BUSINESS_PRICE = `₱${PLAN_PRICING.business.monthly.toLocaleString()}/mo`;

function BusinessLockOverlay() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 rounded-2xl bg-[#080F14]/70 p-6 text-center backdrop-blur-[1px]">
      <Lock className="h-8 w-8 text-[#22c55e]" />
      <p className="text-lg font-bold text-white">Unlock BUSINESS {BUSINESS_PRICE} to Download</p>
      <p className="max-w-sm text-sm text-gray-400">SEC and Mayor&apos;s Permit kits are for teams/corporations — included in the BUSINESS plan.</p>
      <a
        href="/dashboard/settings"
        className="mt-1 rounded-full bg-[#22c55e] px-5 py-2.5 text-sm font-semibold text-[#001A0D] transition hover:bg-[#16a34a]"
      >
        Unlock BUSINESS {BUSINESS_PRICE}
      </a>
    </div>
  );
}

function FieldGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-3 sm:grid-cols-2">{children}</div>;
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-400">{label}</label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="bg-[#0B1218] border-[#1E293B] text-white" />
    </div>
  );
}

function OpenTab({ prefill, isPro, planLoaded }: { prefill: ProfilePrefill; isPro: boolean; planLoaded: boolean; }) {
  const [fullName, setFullName] = useState(prefill.fullName);
  const [tin, setTin] = useState(prefill.tin);
  const [rdoCode, setRdoCode] = useState(prefill.rdoCode);
  const [businessName, setBusinessName] = useState(prefill.businessName);
  const [address, setAddress] = useState(prefill.address);
  const [businessType, setBusinessType] = useState<"freelance" | "sole-prop">("freelance");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setFullName(prefill.fullName);
    setTin(prefill.tin);
    setRdoCode(prefill.rdoCode);
    setBusinessName(prefill.businessName);
    setAddress(prefill.address);
  }, [prefill]);

  async function handleDownload() {
    if (!fullName.trim() || !address.trim()) {
      setError("Full name and address are required.");
      return;
    }
    setError(null);
    setLoading(true);
    const result = await downloadZip(
      "/api/toolkit/open",
      { fullName, tin, rdoCode, businessName, address, businessType },
      "axla-open-business-kit.zip",
    );
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    toast("Open Kit downloaded ✅");
  }

  return (
    <Card className={PREMIUM_CARD}>
      <CardContent className="space-y-5 p-6">
        <div>
          <h2 className="text-lg font-bold text-white">🚀 Mag-oopen ka ng business? 1-click docs</h2>
          <p className="text-sm text-gray-400">BIR 1901 + 0605 reference sheets, RDO checklist, at Taglish script — lahat sa isang ZIP.</p>
        </div>

        <FieldGrid>
          <Field label="Full Name" value={fullName} onChange={setFullName} placeholder="Juan Dela Cruz" />
          <Field label="TIN" value={tin} onChange={setTin} placeholder="123-456-789-000" />
          <Field label="RDO Code" value={rdoCode} onChange={setRdoCode} placeholder="e.g. 044" />
          <Field label="Business Name" value={businessName} onChange={setBusinessName} placeholder="Optional if using your own name" />
        </FieldGrid>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-400">Address</label>
          <Textarea value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Complete business/registered address" className="bg-[#0B1218] border-[#1E293B] text-white" rows={2} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-400">Business Type</label>
          <div className="flex gap-2">
            {(["freelance", "sole-prop"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setBusinessType(t)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  businessType === t ? "bg-[#22c55e] text-[#001A0D]" : "bg-white/5 text-gray-400 hover:text-white"
                }`}
              >
                {t === "freelance" ? "Freelance / Professional" : "Sole Proprietorship"}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="relative">
          <Button onClick={handleDownload} disabled={loading || !planLoaded || !isPro} className="gap-2 bg-[#22c55e] text-[#001A0D] hover:bg-[#16a34a]">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download Open Kit ZIP
          </Button>
          {planLoaded && !isPro && <ProLockOverlay price="₱249/mo" />}
        </div>
      </CardContent>
    </Card>
  );
}

function CloseTab({
  prefill,
  isPro,
  planLoaded,
  warning,
}: {
  prefill: ProfilePrefill;
  isPro: boolean;
  planLoaded: boolean;
  warning: { count: number; penalty: number } | null;
}) {
  const [fullName, setFullName] = useState(prefill.fullName);
  const [tin, setTin] = useState(prefill.tin);
  const [rdoCode, setRdoCode] = useState(prefill.rdoCode);
  const [businessName, setBusinessName] = useState(prefill.businessName);
  const [address, setAddress] = useState(prefill.address);
  const [closureReason, setClosureReason] = useState("");
  const [lastFilingDate, setLastFilingDate] = useState("");
  const [authorizeRep, setAuthorizeRep] = useState(false);
  const [repFullName, setRepFullName] = useState("");
  const [repRelationship, setRepRelationship] = useState(REP_RELATIONSHIPS[0]);
  const [repValidId, setRepValidId] = useState("");
  const [repContactNo, setRepContactNo] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    setFullName(prefill.fullName);
    setTin(prefill.tin);
    setRdoCode(prefill.rdoCode);
    setBusinessName(prefill.businessName);
    setAddress(prefill.address);
  }, [prefill]);

  async function handleDownload() {
    if (!fullName.trim() || !address.trim()) {
      setError("Full name and address are required.");
      return;
    }
    if (authorizeRep && (!repFullName.trim() || !repValidId.trim())) {
      setError("Authorized representative's full name and valid ID are required.");
      return;
    }
    setError(null);
    setLoading(true);
    const result = await downloadZip(
      "/api/toolkit/close",
      {
        fullName,
        tin,
        rdoCode,
        businessName,
        address,
        businessType: "freelance",
        closureReason,
        lastFilingDate,
        authorizeRepresentative: authorizeRep,
        repFullName,
        repRelationship,
        repValidId,
        repContactNo,
      },
      "axla-close-business-kit.zip",
    );
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    setDownloaded(true);
    toast("Close Kit downloaded ✅");
  }

  const closeDocs = [
    "BIR 1905 Reference",
    "Letter of Intent to Close",
    "Close Checklist",
    "RDO Guide",
    ...(authorizeRep ? ["Authorization Letter"] : []),
  ];

  return (
    <Card className={PREMIUM_CARD}>
      <CardContent className="space-y-5 p-6">
        <div>
          <h2 className="text-lg font-bold text-white">💀 Magsara na? Ayusin natin para walang penalty</h2>
          <p className="text-sm text-gray-400">BIR 1905 reference, Letter of Intent, checklist, at RDO guide.</p>
        </div>

        {warning && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <p className="text-sm text-amber-300">
              May {warning.count} open case ka pa sa BIR Guard{warning.penalty > 0 ? ` (${PESO(warning.penalty)} penalty)` : ""} — ayusin muna
              or baka ma-deny ang closure mo.
            </p>
          </div>
        )}

        <FieldGrid>
          <Field label="Full Name" value={fullName} onChange={setFullName} placeholder="Juan Dela Cruz" />
          <Field label="TIN" value={tin} onChange={setTin} placeholder="123-456-789-000" />
          <Field label="RDO Code" value={rdoCode} onChange={setRdoCode} placeholder="e.g. 044" />
          <Field label="Business Name" value={businessName} onChange={setBusinessName} placeholder="Optional if using your own name" />
        </FieldGrid>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-400">Address</label>
          <Textarea value={address} onChange={(e) => setAddress(e.target.value)} className="bg-[#0B1218] border-[#1E293B] text-white" rows={2} />
        </div>
        <FieldGrid>
          <Field label="Reason for Closure" value={closureReason} onChange={setClosureReason} placeholder="e.g. Cessation of business" />
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-400">Last Filing Date</label>
            <Input type="date" value={lastFilingDate} onChange={(e) => setLastFilingDate(e.target.value)} className="bg-[#0B1218] border-[#1E293B] text-white" />
          </div>
        </FieldGrid>

        <div className="space-y-3 rounded-xl border border-[#1E293B] bg-white/5 p-3.5">
          <label className="flex items-center gap-2 text-sm text-gray-300">
            <input
              type="checkbox"
              checked={authorizeRep}
              onChange={(e) => setAuthorizeRep(e.target.checked)}
              className="h-4 w-4 rounded border-[#1E293B] bg-[#0B1218] accent-[#22c55e]"
            />
            I will authorize someone else to process my closure
          </label>

          {authorizeRep && (
            <div className="space-y-3 border-t border-[#1E293B] pt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">👤 Authorized Representative Details</p>
              <FieldGrid>
                <Field label="Full Name" value={repFullName} onChange={setRepFullName} placeholder="Juan Dela Cruz" />
                <SelectField label="Relationship" value={repRelationship} onChange={setRepRelationship} options={REP_RELATIONSHIPS} />
                <Field label="Valid ID Presented" value={repValidId} onChange={setRepValidId} placeholder="e.g. UMID 1234-5678901-1" />
                <Field label="Contact No." value={repContactNo} onChange={setRepContactNo} placeholder="09XXXXXXXXX" />
              </FieldGrid>
            </div>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="relative">
          <Button onClick={handleDownload} disabled={loading || !planLoaded || !isPro} className="gap-2 bg-[#22c55e] text-[#001A0D] hover:bg-[#16a34a]">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download Close Kit ZIP
          </Button>
          {planLoaded && !isPro && <ProLockOverlay price="₱249/mo" />}
        </div>

        {downloaded && <ENotaryReadyBanner docs={closeDocs} />}
      </CardContent>
    </Card>
  );
}

function SpaTab({ prefill, isPro, planLoaded }: { prefill: ProfilePrefill; isPro: boolean; planLoaded: boolean }) {
  const [principalName, setPrincipalName] = useState(prefill.fullName);
  const [principalTin, setPrincipalTin] = useState(prefill.tin);
  const [principalAddress, setPrincipalAddress] = useState(prefill.address);
  const [representativeName, setRepresentativeName] = useState("");
  const [representativeAddress, setRepresentativeAddress] = useState("");
  const [representativeEmail, setRepresentativeEmail] = useState("");
  const [relationship, setRelationship] = useState("");
  const [rdoCode, setRdoCode] = useState(prefill.rdoCode);
  const [scope, setScope] = useState({ closeBusiness: false, surrenderBooks: false, getCor: false, fileReturns: false });
  const [loading, setLoading] = useState(false);
  const [emailing, setEmailing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [downloaded, setDownloaded] = useState(false);

  useEffect(() => {
    setPrincipalName(prefill.fullName);
    setPrincipalTin(prefill.tin);
    setPrincipalAddress(prefill.address);
    setRdoCode(prefill.rdoCode);
  }, [prefill]);

  function spaBody() {
    return { principalName, principalTin, principalAddress, representativeName, representativeAddress, relationship, rdoCode, scope };
  }

  function validate(): string | null {
    if (!principalName.trim() || !principalAddress.trim()) return "Your name and address are required.";
    if (!representativeName.trim() || !representativeAddress.trim()) return "Representative name and address are required.";
    return null;
  }

  async function handleDownload() {
    const v = validate();
    if (v) return setError(v);
    setError(null);
    setLoading(true);
    const result = await downloadZip("/api/toolkit/spa", spaBody(), "axla-spa-kit.zip");
    setLoading(false);
    if (!result.ok) return setError(result.error ?? "Something went wrong.");
    setDownloaded(true);
    toast("SPA Kit downloaded ✅");
  }

  async function handleEmail() {
    const v = validate();
    if (v) return setError(v);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(representativeEmail)) return setError("A valid representative email is required.");
    setError(null);
    setEmailing(true);
    try {
      const res = await fetch("/api/toolkit/spa/email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...spaBody(), representativeEmail }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Couldn't send the email.");
        return;
      }
      setDownloaded(true);
      toast(`Sent to ${representativeEmail} ✅`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setEmailing(false);
    }
  }

  const spaDocs = ["SPA Template", "RDO Cover Letter", "Notary Guide"];

  const scopeOptions: Array<{ key: keyof typeof scope; label: string }> = [
    { key: "closeBusiness", label: "Close business" },
    { key: "surrenderBooks", label: "Surrender books" },
    { key: "getCor", label: "Get COR" },
    { key: "fileReturns", label: "File returns" },
  ];

  return (
    <Card className={PREMIUM_CARD}>
      <CardContent className="space-y-5 p-6">
        <div>
          <h2 className="text-lg font-bold text-white">✈️ Nasa abroad ka? Hindi makapunta sa RDO?</h2>
          <p className="text-sm text-gray-400">SPA template with notary block, RDO cover letter, at notary guide.</p>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Principal (you)</p>
          <FieldGrid>
            <Field label="Full Name" value={principalName} onChange={setPrincipalName} />
            <Field label="TIN" value={principalTin} onChange={setPrincipalTin} />
          </FieldGrid>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-400">Address</label>
            <Textarea value={principalAddress} onChange={(e) => setPrincipalAddress(e.target.value)} className="bg-[#0B1218] border-[#1E293B] text-white" rows={2} />
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Representative</p>
          <FieldGrid>
            <Field label="Full Name" value={representativeName} onChange={setRepresentativeName} />
            <Field label="Relationship" value={relationship} onChange={setRelationship} placeholder="e.g. Sister, Accountant" />
            <Field label="Email" value={representativeEmail} onChange={setRepresentativeEmail} placeholder="for the Email button below" />
            <Field label="RDO Code" value={rdoCode} onChange={setRdoCode} />
          </FieldGrid>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-400">Address</label>
            <Textarea value={representativeAddress} onChange={(e) => setRepresentativeAddress(e.target.value)} className="bg-[#0B1218] border-[#1E293B] text-white" rows={2} />
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Scope</p>
          <div className="flex flex-wrap gap-3">
            {scopeOptions.map((opt) => (
              <label key={opt.key} className="flex items-center gap-2 text-sm text-gray-300">
                <input
                  type="checkbox"
                  checked={scope[opt.key]}
                  onChange={(e) => setScope((s) => ({ ...s, [opt.key]: e.target.checked }))}
                  className="h-4 w-4 rounded border-[#1E293B] bg-[#0B1218] accent-[#22c55e]"
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="relative flex flex-wrap gap-3">
          <Button onClick={handleDownload} disabled={loading || !planLoaded || !isPro} className="gap-2 bg-[#22c55e] text-[#001A0D] hover:bg-[#16a34a]">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download SPA PDF
          </Button>
          <Button
            onClick={handleEmail}
            disabled={emailing || !planLoaded || !isPro}
            variant="outline"
            className="gap-2 border-[#1E293B] text-white hover:bg-white/5"
          >
            {emailing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Email to Representative
          </Button>
          {planLoaded && !isPro && <ProLockOverlay price="₱249/mo" />}
        </div>

        <p className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-gray-400">
          Template only, need notary to be legally binding. If the principal is abroad, this needs consularization/apostille instead of a
          regular Philippine notary — see the included notary guide.
        </p>

        {downloaded && <ENotaryReadyBanner docs={spaDocs} />}
      </CardContent>
    </Card>
  );
}

type RegSubTab = "dti" | "sec" | "mayors";

const BUSINESS_SCOPES = ["Online Freelancing", "Consulting", "Retail", "Services", "Food", "Other"];
const COMPANY_TYPES = ["One Person Corporation", "Corporation", "Partnership"];
const CITIES: Array<{ value: string; label: string }> = [
  { value: "QC", label: "Quezon City" },
  { value: "Manila", label: "Manila" },
  { value: "Makati", label: "Makati" },
  { value: "Cebu", label: "Cebu City" },
  { value: "Davao", label: "Davao City" },
  { value: "Other", label: "Other" },
];

const CITY_CHECKLISTS: Record<string, string[]> = {
  QC: ["DTI/SEC Certificate", "BIR 2303", "Barangay Clearance", "Lease Contract", "Valid ID", "Locational Clearance", "Fire Safety Inspection"],
  Manila: [
    "DTI/SEC Certificate",
    "BIR 2303",
    "Barangay Clearance",
    "Lease Contract",
    "Valid ID",
    "Locational Clearance",
    "Fire Safety Inspection",
    "Sanitary Permit",
    "Cedula",
  ],
  Makati: ["DTI/SEC Certificate", "BIR 2303", "Barangay Clearance", "Lease Contract", "Valid ID", "Locational Clearance", "Fire Safety Inspection", "Zoning Clearance"],
  Cebu: ["DTI/SEC Certificate", "BIR 2303", "Barangay Clearance", "Lease Contract", "Valid ID", "Locational/Zoning Clearance (confirm with city hall)", "Fire Safety Inspection"],
  Davao: ["DTI/SEC Certificate", "BIR 2303", "Barangay Clearance", "Lease Contract", "Valid ID", "Locational/Zoning Clearance (confirm with city hall)", "Fire Safety Inspection"],
  Other: ["DTI/SEC Certificate", "BIR 2303", "Barangay Clearance", "Lease Contract", "Valid ID", "Locational/Zoning Clearance (confirm with city hall)", "Fire Safety Inspection"],
};

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string } | string>;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-400">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-[#1E293B] bg-[#0B1218] px-3 py-2.5 text-sm text-white focus:border-[#22c55e] focus:outline-none focus:ring-2 focus:ring-[#22c55e]/30"
      >
        {options.map((opt) => {
          const v = typeof opt === "string" ? opt : opt.value;
          const l = typeof opt === "string" ? opt : opt.label;
          return (
            <option key={v} value={v} className="bg-[#0B1218] text-white">
              {l}
            </option>
          );
        })}
      </select>
    </div>
  );
}

function RegistrationTab({
  prefill,
  isPro,
  isBusiness,
  planLoaded,
}: {
  prefill: ProfilePrefill;
  isPro: boolean;
  isBusiness: boolean;
  planLoaded: boolean;
}) {
  const [subTab, setSubTab] = useState<RegSubTab>("dti");
  const [dtiBusinessName, setDtiBusinessName] = useState("");

  return (
    <Card className={PREMIUM_CARD}>
      <CardContent className="space-y-5 p-6">
        <div className="flex gap-2 overflow-x-auto rounded-xl bg-white/5 p-1">
          {(
            [
              { key: "dti", label: "DTI (Sole Prop)" },
              { key: "sec", label: "SEC (Corp)" },
              { key: "mayors", label: "Mayor's Permit" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.key}
              onClick={() => setSubTab(opt.key)}
              className={`flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition ${
                subTab === opt.key ? "bg-[#22c55e] text-[#001A0D]" : "text-gray-400 hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {subTab === "dti" && <DtiSubTab prefill={prefill} isPro={isPro} planLoaded={planLoaded} onBusinessNameChange={setDtiBusinessName} />}
        {subTab === "sec" && <SecSubTab isBusiness={isBusiness} planLoaded={planLoaded} />}
        {subTab === "mayors" && <MayorsSubTab isBusiness={isBusiness} planLoaded={planLoaded} autoFillBusinessName={dtiBusinessName} />}
      </CardContent>
    </Card>
  );
}

function DtiSubTab({
  prefill,
  isPro,
  planLoaded,
  onBusinessNameChange,
}: {
  prefill: ProfilePrefill;
  isPro: boolean;
  planLoaded: boolean;
  onBusinessNameChange: (name: string) => void;
}) {
  const [businessName1, setBusinessName1] = useState(prefill.businessName);
  const [businessName2, setBusinessName2] = useState("");
  const [businessName3, setBusinessName3] = useState("");
  const [businessScope, setBusinessScope] = useState(BUSINESS_SCOPES[0]);
  const [capital, setCapital] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setBusinessName1(prefill.businessName);
  }, [prefill]);

  useEffect(() => {
    onBusinessNameChange(businessName1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [businessName1]);

  async function handleDownload() {
    if (!businessName1.trim() && !businessName2.trim() && !businessName3.trim()) {
      setError("At least one business name option is required.");
      return;
    }
    setError(null);
    setLoading(true);
    const result = await downloadZip(
      "/api/toolkit/dti",
      {
        fullName: prefill.fullName,
        tin: prefill.tin,
        address: prefill.address,
        businessNameOptions: [businessName1, businessName2, businessName3],
        businessScope,
        capital: Number(capital) || 0,
      },
      "axla-dti-kit.zip",
    );
    setLoading(false);
    if (!result.ok) return setError(result.error ?? "Something went wrong.");
    toast("DTI Kit downloaded ✅");
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-white">🏪 Mag-DTI ka? 1-click docs</h2>
        <p className="text-sm text-gray-400">BNRS reference sheet with QR, filing checklist, at payment guide — lahat sa isang ZIP.</p>
      </div>

      <FieldGrid>
        <Field label="Business Name — Option 1" value={businessName1} onChange={setBusinessName1} placeholder="First choice" />
        <Field label="Business Name — Option 2" value={businessName2} onChange={setBusinessName2} placeholder="Backup choice" />
        <Field label="Business Name — Option 3" value={businessName3} onChange={setBusinessName3} placeholder="Backup choice" />
        <SelectField label="Business Scope" value={businessScope} onChange={setBusinessScope} options={BUSINESS_SCOPES} />
      </FieldGrid>
      <div className="max-w-xs space-y-1.5">
        <label className="text-xs font-medium text-gray-400">Capital (₱)</label>
        <Input type="number" min="0" value={capital} onChange={(e) => setCapital(e.target.value)} placeholder="e.g. 50000" className="bg-[#0B1218] border-[#1E293B] text-white" />
      </div>

      <p className="text-xs text-gray-500">Full name, TIN, and address are reused from your profile automatically.</p>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="relative">
        <Button onClick={handleDownload} disabled={loading || !planLoaded || !isPro} className="gap-2 bg-[#22c55e] text-[#001A0D] hover:bg-[#16a34a]">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Generate DTI Kit ZIP
        </Button>
        {planLoaded && !isPro && <ProLockOverlay price="₱249/mo" />}
      </div>
    </div>
  );
}

interface DirectorRow {
  name: string;
  tin: string;
  address: string;
  shares: string;
}

function SecSubTab({ isBusiness, planLoaded }: { isBusiness: boolean; planLoaded: boolean }) {
  const [companyName1, setCompanyName1] = useState("");
  const [companyName2, setCompanyName2] = useState("");
  const [companyName3, setCompanyName3] = useState("");
  const [companyType, setCompanyType] = useState(COMPANY_TYPES[1]);
  const [numberOfDirectors, setNumberOfDirectors] = useState("1");
  const [authorizedCapital, setAuthorizedCapital] = useState("");
  const [subscribedCapital, setSubscribedCapital] = useState("");
  const [paidUpCapital, setPaidUpCapital] = useState("");
  const [directors, setDirectors] = useState<DirectorRow[]>([{ name: "", tin: "", address: "", shares: "" }]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function updateDirector(index: number, patch: Partial<DirectorRow>) {
    setDirectors((rows) => rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  }
  function addDirector() {
    setDirectors((rows) => [...rows, { name: "", tin: "", address: "", shares: "" }]);
  }
  function removeDirector(index: number) {
    setDirectors((rows) => rows.filter((_, i) => i !== index));
  }

  async function handleDownload() {
    if (!companyName1.trim() && !companyName2.trim() && !companyName3.trim()) {
      setError("At least one company name option is required.");
      return;
    }
    setError(null);
    setLoading(true);
    const result = await downloadZip(
      "/api/toolkit/sec",
      {
        companyNameOptions: [companyName1, companyName2, companyName3],
        companyType,
        numberOfDirectors: Number(numberOfDirectors) || directors.length,
        authorizedCapital: Number(authorizedCapital) || 0,
        subscribedCapital: Number(subscribedCapital) || 0,
        paidUpCapital: Number(paidUpCapital) || 0,
        directors: directors
          .filter((d) => d.name.trim())
          .map((d) => ({ name: d.name, tin: d.tin, address: d.address, shares: Number(d.shares) || 0 })),
      },
      "axla-sec-kit.zip",
    );
    setLoading(false);
    if (!result.ok) return setError(result.error ?? "Something went wrong.");
    toast("SEC Kit downloaded ✅");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold text-white">🏢 Nagsi-SEC ka? Corp docs in one click</h2>
        <span className="rounded-full bg-[#22c55e]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#22c55e]">{BUSINESS_PRICE}</span>
      </div>
      <p className="text-sm text-gray-400">Articles of Incorporation + By-Laws templates, cover sheet, at eSPARC checklist.</p>

      <FieldGrid>
        <Field label="Company Name — Option 1" value={companyName1} onChange={setCompanyName1} />
        <Field label="Company Name — Option 2" value={companyName2} onChange={setCompanyName2} />
        <Field label="Company Name — Option 3" value={companyName3} onChange={setCompanyName3} />
        <SelectField label="Company Type" value={companyType} onChange={setCompanyType} options={COMPANY_TYPES} />
      </FieldGrid>
      <FieldGrid>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-400">Number of Directors</label>
          <Input type="number" min="1" value={numberOfDirectors} onChange={(e) => setNumberOfDirectors(e.target.value)} className="bg-[#0B1218] border-[#1E293B] text-white" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-400">Authorized Capital (₱)</label>
          <Input type="number" min="0" value={authorizedCapital} onChange={(e) => setAuthorizedCapital(e.target.value)} className="bg-[#0B1218] border-[#1E293B] text-white" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-400">Subscribed Capital (₱)</label>
          <Input type="number" min="0" value={subscribedCapital} onChange={(e) => setSubscribedCapital(e.target.value)} className="bg-[#0B1218] border-[#1E293B] text-white" />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-400">Paid-up Capital (₱)</label>
          <Input type="number" min="0" value={paidUpCapital} onChange={(e) => setPaidUpCapital(e.target.value)} className="bg-[#0B1218] border-[#1E293B] text-white" />
        </div>
      </FieldGrid>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Directors</p>
          <Button onClick={addDirector} variant="outline" size="sm" className="gap-1.5 border-[#1E293B] text-white hover:bg-white/5">
            <Plus className="h-3.5 w-3.5" />
            Add Director
          </Button>
        </div>
        {directors.map((d, i) => (
          <div key={i} className="grid gap-2 rounded-xl border border-[#1E293B] bg-white/5 p-3 sm:grid-cols-5">
            <Input value={d.name} onChange={(e) => updateDirector(i, { name: e.target.value })} placeholder="Name" className="bg-[#0B1218] border-[#1E293B] text-white sm:col-span-2" />
            <Input value={d.tin} onChange={(e) => updateDirector(i, { tin: e.target.value })} placeholder="TIN" className="bg-[#0B1218] border-[#1E293B] text-white" />
            <Input value={d.address} onChange={(e) => updateDirector(i, { address: e.target.value })} placeholder="Address" className="bg-[#0B1218] border-[#1E293B] text-white" />
            <div className="flex gap-2">
              <Input
                type="number"
                min="0"
                value={d.shares}
                onChange={(e) => updateDirector(i, { shares: e.target.value })}
                placeholder="Shares"
                className="bg-[#0B1218] border-[#1E293B] text-white"
              />
              {directors.length > 1 && (
                <button onClick={() => removeDirector(i)} className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-red-500/10 hover:text-red-400">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="relative">
        <Button onClick={handleDownload} disabled={loading || !planLoaded || !isBusiness} className="gap-2 bg-[#22c55e] text-[#001A0D] hover:bg-[#16a34a]">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Generate SEC Kit ZIP
        </Button>
        {planLoaded && !isBusiness && <BusinessLockOverlay />}
      </div>
    </div>
  );
}

function MayorsSubTab({
  isBusiness,
  planLoaded,
  autoFillBusinessName,
}: {
  isBusiness: boolean;
  planLoaded: boolean;
  autoFillBusinessName: string;
}) {
  const [city, setCity] = useState("QC");
  const [businessName, setBusinessName] = useState(autoFillBusinessName);
  const [address, setAddress] = useState("");
  const [natureOfBusiness, setNatureOfBusiness] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touchedBusinessName, setTouchedBusinessName] = useState(false);

  useEffect(() => {
    if (!touchedBusinessName && autoFillBusinessName) setBusinessName(autoFillBusinessName);
  }, [autoFillBusinessName, touchedBusinessName]);

  async function handleDownload() {
    if (!businessName.trim() || !address.trim()) {
      setError("Business name and address are required.");
      return;
    }
    setError(null);
    setLoading(true);
    const result = await downloadZip("/api/toolkit/mayors", { city, businessName, address, natureOfBusiness }, "axla-mayors-kit.zip");
    setLoading(false);
    if (!result.ok) return setError(result.error ?? "Something went wrong.");
    toast("Mayor's Kit downloaded ✅");
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <h2 className="text-lg font-bold text-white">🏛️ Mayor's Permit — Checklist per City</h2>
        <span className="rounded-full bg-[#22c55e]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#22c55e]">{BUSINESS_PRICE}</span>
      </div>
      <p className="text-sm text-gray-400">Application reference, Barangay request letter, at checklist na sunod sa city mo.</p>

      <FieldGrid>
        <SelectField label="City" value={city} onChange={setCity} options={CITIES} />
        <Field
          label="Business Name"
          value={businessName}
          onChange={(v) => {
            setTouchedBusinessName(true);
            setBusinessName(v);
          }}
          placeholder="Auto-filled from DTI tab if set"
        />
        <Field label="Nature of Business" value={natureOfBusiness} onChange={setNatureOfBusiness} placeholder="e.g. Online retail" />
      </FieldGrid>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-gray-400">Business Address</label>
        <Textarea value={address} onChange={(e) => setAddress(e.target.value)} className="bg-[#0B1218] border-[#1E293B] text-white" rows={2} />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Requirements checklist — {CITIES.find((c) => c.value === city)?.label}</p>
        <div className="grid gap-1.5 sm:grid-cols-2">
          {(CITY_CHECKLISTS[city] ?? CITY_CHECKLISTS.Other).map((item) => (
            <div key={item} className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-xs text-gray-300">
              <div className="h-2 w-2 shrink-0 rounded-full bg-[#22c55e]" />
              {item}
            </div>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="relative">
        <Button onClick={handleDownload} disabled={loading || !planLoaded || !isBusiness} className="gap-2 bg-[#22c55e] text-[#001A0D] hover:bg-[#16a34a]">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Generate Mayor's Kit ZIP
        </Button>
        {planLoaded && !isBusiness && <BusinessLockOverlay />}
      </div>
    </div>
  );
}
