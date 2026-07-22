"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ChevronDown, Star, Pencil, Trash2, Plus, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { RDO_LIST } from "@/lib/dashboard/rdo-list";
import { PLAN_PRICING, type BillingCycle, type PaidPlan } from "@/lib/plans";
import { cn } from "@/lib/utils";
import { UsageMeter } from "@/components/dashboard/UsageMeter";
import { ConfettiBurst } from "@/components/dashboard/ConfettiBurst";
import { UpgradeWallModal, type UpgradeWallType } from "@/components/dashboard/UpgradeWallModal";
import type { UsageSummary } from "@/lib/usage";

const UPGRADE_PENDING_KEY = "axla_upgrade_pending";

type TaxType = "8%" | "3%" | "itemized";

interface Profile {
  email: string;
  full_name: string | null;
  business_name: string | null;
  tin_number: string | null;
  address: string | null;
  tax_type: TaxType;
  rdo_code: string | null;
}

interface Business {
  id: string;
  name: string;
  tin: string | null;
  rdo_code: string | null;
  branch_code: string;
  address: string | null;
  is_primary: boolean;
}

const TAX_TYPE_INFO: Record<TaxType, string> = {
  "8%": "Simple flat 8% on gross income above ₱250,000/year. Best for most freelancers under ₱3M annual gross.",
  "3%": "Percentage tax on gross receipts, no deductions. For non-VAT registered businesses.",
  itemized: "Graduated tax rates with deductible business expenses. Common for higher income or corp-adjacent setups.",
};

const BRANCH_CODES = ["000", "001", "002", "003", "004", "005", "006", "007", "008", "009", "010"];

function formatTin(tin: string | null): string {
  if (!tin) return "Not set";
  const digits = tin.replace(/\D/g, "");
  if (digits.length < 9) return tin;
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6, 9)}${digits.length > 9 ? "-" + digits.slice(9) : ""}`;
}

function RdoPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => RDO_LIST.find((r) => `${r.code} - ${r.name}` === value), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return RDO_LIST;
    return RDO_LIST.filter((r) => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-slate-700 bg-slate-900 px-3 text-left text-sm text-slate-100 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
      >
        <span className={selected ? "text-slate-100" : "text-slate-500"}>
          {selected ? `RDO ${selected.code} - ${selected.name}` : "Select RDO"}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
          <div className="border-b border-slate-800 p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search RDO code or city..."
              className="h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-sm text-slate-500">No matches.</p>
            ) : (
              filtered.map((rdo) => (
                <button
                  key={rdo.code}
                  type="button"
                  onClick={() => {
                    onChange(`${rdo.code} - ${rdo.name}`);
                    setIsOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
                >
                  <span>
                    <span className="font-medium text-[#00FF85]">RDO {rdo.code}</span> — {rdo.name}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

interface BusinessFormState {
  name: string;
  tin: string;
  rdoCode: string;
  branchCode: string;
  address: string;
}

const EMPTY_BUSINESS_FORM: BusinessFormState = { name: "", tin: "", rdoCode: "", branchCode: "000", address: "" };

function BusinessDialog({
  open,
  onOpenChange,
  editing,
  onSaved,
  onLimitReached,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Business | null;
  onSaved: () => void;
  onLimitReached: (message: string) => void;
}) {
  const [form, setForm] = useState<BusinessFormState>(EMPTY_BUSINESS_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (editing) {
      setForm({
        name: editing.name,
        tin: editing.tin ?? "",
        rdoCode: editing.rdo_code ?? "",
        branchCode: editing.branch_code,
        address: editing.address ?? "",
      });
    } else {
      setForm(EMPTY_BUSINESS_FORM);
    }
    setError(null);
  }, [editing, open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSaving(true);
    try {
      const url = editing ? `/api/dashboard/businesses/${editing.id}` : "/api/dashboard/businesses";
      const res = await fetch(url, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 403 && data.code === "LIMIT_REACHED") {
          onOpenChange(false);
          onLimitReached(data.message);
          return;
        }
        setError(data.detail || data.error || "Failed to save business.");
        return;
      }
      onOpenChange(false);
      onSaved();
    } catch {
      setError("Network error.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit business" : "Add a business"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Business name</label>
            <Input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Juan Dela Cruz Freelance Design"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">TIN</label>
            <Input
              value={form.tin}
              onChange={(e) => setForm((f) => ({ ...f, tin: e.target.value }))}
              placeholder="e.g. 123-456-789-000"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Branch code</label>
              <select
                value={form.branchCode}
                onChange={(e) => setForm((f) => ({ ...f, branchCode: e.target.value }))}
                className="h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"
              >
                {BRANCH_CODES.map((code) => (
                  <option key={code} value={code}>
                    {code} {code === "000" ? "(Head Office)" : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">RDO Code</label>
              <RdoPicker value={form.rdoCode} onChange={(v) => setForm((f) => ({ ...f, rdoCode: v }))} />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-300">Address</label>
            <Input
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="e.g. 123 Rizal St., Brgy. San Isidro, Quezon City"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : editing ? "Save changes" : "Add business"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function BusinessesSection() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [upgradeWall, setUpgradeWall] = useState<{ type: UpgradeWallType; message: string } | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Business | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/dashboard/businesses", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) setBusinesses(data.businesses);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openAdd() {
    setEditing(null);
    setIsDialogOpen(true);
  }

  function openEdit(business: Business) {
    setEditing(business);
    setIsDialogOpen(true);
  }

  async function handleSetPrimary(id: string) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/businesses/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isPrimary: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || data.error || "Failed to set primary.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this business? Existing calculations/forms tagged to it are kept but lose the association.")) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/businesses/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || data.error || "Failed to delete business.");
        return;
      }
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle>My Businesses</CardTitle>
        <Button type="button" size="sm" onClick={openAdd}>
          <Plus className="h-4 w-4" />
          Add
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error && (
          <div className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>
        )}

        {isLoading ? (
          <p className="text-sm text-slate-400">Loading...</p>
        ) : businesses.length === 0 ? (
          <p className="text-sm text-slate-400">
            No businesses added yet. Your profile&apos;s business name/TIN/address (below) are used as a
            fallback until you add one.
          </p>
        ) : (
          businesses.map((b) => (
            <div
              key={b.id}
              className="flex flex-col gap-2 rounded-lg border border-slate-700 p-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold text-slate-100">{b.name}</p>
                  {b.is_primary && <Badge variant="success">Primary</Badge>}
                </div>
                <p className="text-xs text-slate-400">
                  TIN: {formatTin(b.tin)} · Branch {b.branch_code} · {b.rdo_code ? `RDO ${b.rdo_code.split(" - ")[0]}` : "RDO not set"}
                </p>
              </div>
              <div className="flex gap-2">
                {!b.is_primary && (
                  <button
                    type="button"
                    onClick={() => handleSetPrimary(b.id)}
                    disabled={busyId === b.id}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 text-xs font-medium text-slate-300 hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Star className="h-3.5 w-3.5" />
                    Set Primary
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => openEdit(b)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-700 px-2.5 text-xs font-medium text-slate-300 hover:bg-slate-800"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(b.id)}
                  disabled={busyId === b.id}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-red-900/50 px-2.5 text-xs font-medium text-red-300 hover:bg-red-950/50 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </div>
          ))
        )}
      </CardContent>

      <BusinessDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        editing={editing}
        onSaved={load}
        onLimitReached={(message) => setUpgradeWall({ type: "business", message })}
      />
      <UpgradeWallModal
        open={Boolean(upgradeWall)}
        onClose={() => setUpgradeWall(null)}
        type={upgradeWall?.type ?? null}
        message={upgradeWall?.message ?? null}
        requiredPlan="business"
      />
    </Card>
  );
}

interface Billing {
  plan: "free" | PaidPlan;
  status: string | null;
  billingCycle: BillingCycle | null;
  currentPeriodEnd: string | null;
}

const PLAN_LABEL: Record<PaidPlan, string> = { pro: "Pro", business: "Business" };

function UsageSection() {
  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showConfetti, setShowConfetti] = useState(false);

  useEffect(() => {
    fetch("/api/usage", { cache: "no-store" })
      .then((res) => res.json())
      .then((data: UsageSummary) => {
        setSummary(data);
        if (data.plan !== "free" && localStorage.getItem(UPGRADE_PENDING_KEY) === "1") {
          localStorage.removeItem(UPGRADE_PENDING_KEY);
          setShowConfetti(true);
          setTimeout(() => setShowConfetti(false), 2800);
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your Usage This Month</CardTitle>
      </CardHeader>
      <CardContent>
        <UsageMeter summary={summary} isLoading={isLoading} />
      </CardContent>
      {showConfetti && <ConfettiBurst />}
    </Card>
  );
}

function BillingSection() {
  const [billing, setBilling] = useState<Billing | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const [checkoutPlan, setCheckoutPlan] = useState<PaidPlan | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/billing", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.plan) setBilling(data);
      })
      .finally(() => setIsLoading(false));
  }, []);

  async function handleUpgrade(plan: PaidPlan) {
    setError(null);
    setCheckoutPlan(plan);
    try {
      const res = await fetch("/api/dashboard/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, billingCycle: cycle }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        setError(data.error || "Failed to start checkout.");
        setCheckoutPlan(null);
        return;
      }
      localStorage.setItem(UPGRADE_PENDING_KEY, "1");
      window.location.href = data.url;
    } catch {
      setError("Network error.");
      setCheckoutPlan(null);
    }
  }

  const currentPlan = billing?.plan ?? "free";

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plan & Billing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <p className="text-sm text-slate-400">Loading...</p>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border border-slate-700 p-3">
              <div>
                <p className="text-sm font-semibold capitalize text-slate-100">{currentPlan} plan</p>
                {billing?.currentPeriodEnd && billing.status === "active" && (
                  <p className="text-xs text-slate-400">
                    Renews{" "}
                    {new Date(billing.currentPeriodEnd).toLocaleDateString("en-PH", {
                      month: "long",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </p>
                )}
              </div>
              {currentPlan !== "free" && <Badge variant="success">{billing?.status ?? "active"}</Badge>}
            </div>

            <div className="flex w-fit gap-1 rounded-lg bg-slate-800 p-1">
              <button
                type="button"
                onClick={() => setCycle("monthly")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition",
                  cycle === "monthly" ? "bg-[#00FF85] text-slate-950" : "text-slate-400 hover:text-slate-200",
                )}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setCycle("yearly")}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition",
                  cycle === "yearly" ? "bg-[#00FF85] text-slate-950" : "text-slate-400 hover:text-slate-200",
                )}
              >
                Yearly <span className="text-[10px] opacity-80">(2 months free)</span>
              </button>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {(Object.keys(PLAN_PRICING) as PaidPlan[]).map((plan) => {
                const isCurrent = currentPlan === plan;
                return (
                  <div key={plan} className="rounded-lg border border-slate-700 p-4">
                    <p className="text-sm font-semibold text-slate-100">{PLAN_LABEL[plan]}</p>
                    <p className="mt-1 text-2xl font-bold text-white">
                      ₱{PLAN_PRICING[plan][cycle].toLocaleString()}
                      <span className="text-sm font-normal text-slate-400">/{cycle === "monthly" ? "mo" : "yr"}</span>
                    </p>
                    <Button
                      type="button"
                      className="mt-3 w-full"
                      variant={isCurrent ? "outline" : "default"}
                      disabled={isCurrent || checkoutPlan !== null}
                      onClick={() => handleUpgrade(plan)}
                    >
                      {checkoutPlan === plan ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Redirecting...
                        </>
                      ) : isCurrent ? (
                        "Current Plan"
                      ) : (
                        `Upgrade to ${PLAN_LABEL[plan]}`
                      )}
                    </Button>
                  </div>
                );
              })}
            </div>

            {error && (
              <div className="rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">{error}</div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [fullName, setFullName] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [tinNumber, setTinNumber] = useState("");
  const [address, setAddress] = useState("");
  const [taxType, setTaxType] = useState<TaxType>("8%");
  const [rdoCode, setRdoCode] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/profile", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.profile) {
          setProfile(data.profile);
          setFullName(data.profile.full_name ?? "");
          setBusinessName(data.profile.business_name ?? "");
          setTinNumber(data.profile.tin_number ?? "");
          setAddress(data.profile.address ?? "");
          setTaxType(data.profile.tax_type);
          setRdoCode(data.profile.rdo_code ?? "");
        }
      })
      .finally(() => setIsLoading(false));
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timer);
  }, [toast]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorDetail(null);
    setIsSaving(true);

    try {
      const res = await fetch("/api/dashboard/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName,
          businessName,
          tinNumber,
          address,
          taxType,
          rdoCode,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to save.");
        setErrorDetail(data.detail ?? null);
        return;
      }
      setToast("Settings saved! ✅ Ma'am/Sir");
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  if (isLoading) {
    return <p className="text-sm text-slate-400">Loading...</p>;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-white">Settings</h1>

      <BusinessesSection />

      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Email</label>
              <Input value={profile?.email ?? ""} disabled />
              <p className="mt-1 text-xs text-slate-500">Your email is your sign-in identity and can&apos;t be changed here.</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Full name</label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="e.g. Juan Dela Cruz"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">
                Business name / Freelancer <span className="text-slate-500">(fallback if you have no businesses above)</span>
              </label>
              <Input
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="e.g. Juan Dela Cruz Freelance Design Services"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">
                Business address <span className="text-slate-500">(fallback)</span>
              </label>
              <Input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="e.g. 123 Rizal St., Brgy. San Isidro, Quezon City"
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">
                TIN Number <span className="text-slate-500">(fallback)</span>
              </label>
              <Input
                value={tinNumber}
                onChange={(e) => setTinNumber(e.target.value)}
                placeholder="e.g. 123-456-789-000"
              />
              <p className="mt-1 text-xs text-slate-500">9-13 digits, dashes optional.</p>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">
                RDO Code <span className="text-slate-500">(fallback)</span>
              </label>
              <RdoPicker value={rdoCode} onChange={setRdoCode} />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-300">Tax type</label>
              <div className="space-y-2">
                {(Object.keys(TAX_TYPE_INFO) as TaxType[]).map((type) => (
                  <label
                    key={type}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition ${
                      taxType === type ? "border-[#00FF85] bg-[#00FF85]/5" : "border-slate-700 hover:bg-slate-800"
                    }`}
                  >
                    <input
                      type="radio"
                      name="taxType"
                      value={type}
                      checked={taxType === type}
                      onChange={() => setTaxType(type)}
                      className="mt-1"
                    />
                    <div>
                      <p className="text-sm font-semibold text-slate-100">
                        {type === "8%" ? "8% Flat" : type === "3%" ? "3% (non-VAT)" : "Graduated (Itemized)"}
                      </p>
                      <p className="text-xs text-slate-400">{TAX_TYPE_INFO[type]}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {error && (
              <div className="space-y-1 rounded-lg border border-red-900 bg-red-950/50 px-3 py-2 text-sm text-red-300">
                <p>{error}</p>
                {errorDetail && <p className="font-mono text-xs text-red-400/80 break-words">{errorDetail}</p>}
              </div>
            )}

            <Button type="submit" disabled={isSaving}>
              {isSaving ? "Saving..." : "Save changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <UsageSection />

      <BillingSection />

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={handleLogout}>
            Log out
          </Button>
        </CardContent>
      </Card>

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-[#00FF85]/30 bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-100 shadow-2xl shadow-black/40"
        >
          <CheckCircle2 className="h-4 w-4 text-[#00FF85]" />
          {toast}
        </div>
      )}
    </div>
  );
}
