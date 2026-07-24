"use client";

import { useEffect, useState } from "react";
import { Briefcase, Rocket, Skull, Plane, Lock, Loader2, AlertTriangle, Send, Download } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

const PREMIUM_CARD =
  "rounded-2xl border-[#1E293B] bg-[#121A22] shadow-sm transition hover:border-[#22c55e]/30 hover:shadow-lg hover:shadow-green-500/10";
const PESO = (n: number) => `₱${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

type Tab = "open" | "close" | "spa";

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
        </div>

        {tab === "open" && <OpenTab prefill={prefill} isPro={isPro} planLoaded={planLoaded} />}
        {tab === "close" && <CloseTab prefill={prefill} isPro={isPro} planLoaded={planLoaded} warning={openCasesWarning} />}
        {tab === "spa" && <SpaTab prefill={prefill} isPro={isPro} planLoaded={planLoaded} />}

        <p className="text-xs text-gray-500">
          Template only — generated documents are AXLA reference sheets, not the official BIR forms, and are not legally binding until
          properly filed/notarized where applicable.
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
      "/api/toolkit/close",
      { fullName, tin, rdoCode, businessName, address, businessType: "freelance", closureReason, lastFilingDate },
      "axla-close-business-kit.zip",
    );
    setLoading(false);
    if (!result.ok) {
      setError(result.error ?? "Something went wrong.");
      return;
    }
    toast("Close Kit downloaded ✅");
  }

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

        {error && <p className="text-sm text-red-400">{error}</p>}

        <div className="relative">
          <Button onClick={handleDownload} disabled={loading || !planLoaded || !isPro} className="gap-2 bg-[#22c55e] text-[#001A0D] hover:bg-[#16a34a]">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Download Close Kit ZIP
          </Button>
          {planLoaded && !isPro && <ProLockOverlay price="₱249/mo" />}
        </div>
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
      toast(`Sent to ${representativeEmail} ✅`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setEmailing(false);
    }
  }

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
      </CardContent>
    </Card>
  );
}
