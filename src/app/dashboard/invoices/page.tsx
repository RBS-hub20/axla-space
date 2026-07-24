"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Receipt,
  Plus,
  Search,
  Loader2,
  Trash2,
  Download,
  Eye,
  Send,
  CheckCircle2,
  Copy,
  Lock,
  Settings as SettingsIcon,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";

const PREMIUM_CARD =
  "rounded-2xl border-[#1E293B] bg-[#121A22] shadow-sm transition hover:border-[#00FF88]/30 hover:shadow-lg hover:shadow-green-500/10";
const PESO = (n: number, currency = "PHP") => `${currency} ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const PAYMENT_TERMS_OPTIONS = [7, 15, 30, 45];

interface InvoiceItem {
  description: string;
  qty: number;
  rate: number;
  amount: number;
}

interface Invoice {
  id: string;
  invoice_number: string;
  client_name: string;
  client_email: string | null;
  client_tin: string | null;
  client_address: string | null;
  business_info: Record<string, unknown>;
  items: InvoiceItem[];
  subtotal: number;
  tax_type: "non_vat" | "vat";
  tax_amount: number;
  total: number;
  currency: string;
  payment_terms: number | null;
  due_date: string | null;
  notes: string | null;
  payment_details: { gcash?: string; maya?: string; bank?: string; showQr?: boolean };
  status: "draft" | "sent" | "paid";
  tax_included: boolean;
  created_at: string;
}

interface Stats {
  totalInvoicedThisMonth: number;
  outstanding: number;
  paidThisMonth: number;
  freeInvoicesLeft: number | null;
}

function toast(message: string) {
  const el = document.createElement("div");
  el.textContent = message;
  el.className =
    "fixed bottom-6 left-1/2 z-[100] -translate-x-1/2 rounded-full bg-[#1E293B] px-4 py-2 text-sm font-medium text-white shadow-lg";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2600);
}

function statusBadge(status: Invoice["status"]) {
  if (status === "paid") return <Badge variant="success">Paid</Badge>;
  if (status === "sent") return <Badge variant="warning">Sent</Badge>;
  return <Badge variant="default">Draft</Badge>;
}

async function downloadBlob(url: string, filename: string) {
  const res = await fetch(url);
  if (!res.ok) {
    toast("Couldn't download file.");
    return;
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
}

export default function InvoicesPage() {
  const searchParams = useSearchParams();
  const [mainTab, setMainTab] = useState<"invoices" | "settings">("invoices");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [plan, setPlan] = useState<"free" | "pro" | "business">("free");
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "draft" | "sent" | "paid">("all");
  const [search, setSearch] = useState("");
  const [newInvoiceOpen, setNewInvoiceOpen] = useState(false);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [taxIncludedPrompt, setTaxIncludedPrompt] = useState<Invoice | null>(null);
  const [prefill, setPrefill] = useState<{ clientName?: string; amount?: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/invoices", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      setInvoices(data.invoices ?? []);
      setStats(data.stats ?? null);
      setPlan(data.plan ?? "free");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const clientName = searchParams.get("client");
    const amount = searchParams.get("amount");
    if (clientName || amount) {
      setPrefill({ clientName: clientName ?? undefined, amount: amount ? Number(amount) : undefined });
      setNewInvoiceOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const previousClients = useMemo(() => Array.from(new Set(invoices.map((i) => i.client_name))).filter(Boolean), [invoices]);

  const filteredInvoices = invoices.filter((inv) => {
    if (filter !== "all" && inv.status !== filter) return false;
    if (search && !inv.client_name.toLowerCase().includes(search.toLowerCase()) && !inv.invoice_number.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    return true;
  });

  async function handleMarkPaid(invoice: Invoice) {
    const res = await fetch(`/api/invoices/${invoice.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paid" }),
    });
    if (!res.ok) {
      toast("Couldn't update invoice.");
      return;
    }
    await load();
    setTaxIncludedPrompt(invoice);
  }

  async function handleDuplicate(invoice: Invoice) {
    const res = await fetch(`/api/invoices/${invoice.id}/duplicate`, { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      if (data.code === "UPGRADE_REQUIRED") setUpgradeOpen(true);
      else toast(data.error || "Couldn't duplicate invoice.");
      return;
    }
    toast(`Duplicated as ${data.invoice.invoice_number}`);
    await load();
  }

  async function handleDelete(invoice: Invoice) {
    if (!confirm(`Delete ${invoice.invoice_number}? This can't be undone.`)) return;
    const res = await fetch(`/api/invoices/${invoice.id}`, { method: "DELETE" });
    if (!res.ok) {
      toast("Couldn't delete invoice.");
      return;
    }
    toast("Invoice deleted.");
    await load();
  }

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#080F14] px-4 py-6 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Receipt className="h-6 w-6 text-[#22c55e]" />
              <h1 className="text-2xl font-bold text-white">E-Invoice</h1>
              <span className="rounded-full bg-[#22c55e]/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#22c55e]">
                NEW — EIS-Ready — BIR 2026 Compliant
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-400">Be ahead of the 2026 BIR E-Invoicing Mandate (RR 11-2024)</p>
          </div>
          <div className="flex gap-2">
            <TabButton active={mainTab === "invoices"} onClick={() => setMainTab("invoices")} label="Invoices" />
            <TabButton active={mainTab === "settings"} onClick={() => setMainTab("settings")} label="Settings" icon={<SettingsIcon className="h-3.5 w-3.5" />} />
          </div>
        </div>

        {mainTab === "settings" ? (
          <SettingsPanel />
        ) : (
          <>
            {/* Stats */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard label="Total Invoiced This Month" value={loading ? "—" : PESO(stats?.totalInvoicedThisMonth ?? 0)} />
              <StatCard label="Outstanding (Sent, Unpaid)" value={loading ? "—" : PESO(stats?.outstanding ?? 0)} accent="amber" />
              <StatCard label="Paid This Month" value={loading ? "—" : PESO(stats?.paidThisMonth ?? 0)} accent="green" />
              <StatCard
                label="Free Invoices Left"
                value={loading ? "—" : stats?.freeInvoicesLeft === null ? "Unlimited" : String(stats?.freeInvoicesLeft)}
              />
            </div>

            {/* Filters + search + new */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-1.5 rounded-xl border border-[#1E293B] bg-[#121A22] p-1">
                {(["all", "draft", "sent", "paid"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                      filter === f ? "bg-[#22c55e] text-[#001A0D]" : "text-gray-400 hover:text-white"
                    }`}
                  >
                    {f}
                  </button>
                ))}
              </div>
              <div className="flex flex-1 items-center gap-3 sm:flex-none">
                <div className="relative flex-1 sm:w-64">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search by client..."
                    className="border-[#1E293B] bg-[#0B1218] pl-9 text-white"
                  />
                </div>
                <Button
                  onClick={() => {
                    if (plan === "free" && (stats?.freeInvoicesLeft ?? 0) <= 0) {
                      setUpgradeOpen(true);
                      return;
                    }
                    setNewInvoiceOpen(true);
                  }}
                  className="shrink-0 gap-2 bg-[#22c55e] text-[#001A0D] hover:bg-[#16a34a]"
                >
                  <Plus className="h-4 w-4" />
                  New Invoice
                </Button>
              </div>
            </div>

            {/* Table */}
            <Card className={PREMIUM_CARD}>
              <CardContent className="p-0">
                {loading ? (
                  <div className="flex items-center justify-center p-10 text-gray-500">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : filteredInvoices.length === 0 ? (
                  <div className="p-10 text-center text-sm text-gray-500">
                    {invoices.length === 0 ? "No invoices yet — create your first one." : "No invoices match your filter."}
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[#1E293B] text-left text-xs uppercase tracking-wide text-gray-500">
                          <th className="px-4 py-3">Invoice #</th>
                          <th className="px-4 py-3">Client</th>
                          <th className="px-4 py-3">Amount</th>
                          <th className="px-4 py-3">Status</th>
                          <th className="px-4 py-3">Date</th>
                          <th className="px-4 py-3">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredInvoices.map((inv) => (
                          <tr key={inv.id} className="border-b border-[#1E293B]/60 last:border-0">
                            <td className="px-4 py-3 font-medium text-white">{inv.invoice_number}</td>
                            <td className="px-4 py-3 text-gray-300">{inv.client_name}</td>
                            <td className="px-4 py-3 text-gray-300">{PESO(inv.total, inv.currency)}</td>
                            <td className="px-4 py-3">{statusBadge(inv.status)}</td>
                            <td className="px-4 py-3 text-gray-500">{new Date(inv.created_at).toLocaleDateString("en-PH")}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <IconButton title="View" onClick={() => setViewInvoice(inv)}>
                                  <Eye className="h-4 w-4" />
                                </IconButton>
                                <IconButton title="Download PDF" onClick={() => downloadBlob(`/api/invoices/pdf?id=${inv.id}`, `${inv.invoice_number}.pdf`)}>
                                  <Download className="h-4 w-4" />
                                </IconButton>
                                {inv.status !== "paid" && (
                                  <IconButton title="Mark Paid" onClick={() => handleMarkPaid(inv)}>
                                    <CheckCircle2 className="h-4 w-4" />
                                  </IconButton>
                                )}
                                <IconButton title="Duplicate" onClick={() => handleDuplicate(inv)}>
                                  <Copy className="h-4 w-4" />
                                </IconButton>
                                <IconButton title="Delete" onClick={() => handleDelete(inv)} danger>
                                  <Trash2 className="h-4 w-4" />
                                </IconButton>
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
          </>
        )}

        <p className="text-xs text-gray-500">
          EIS-Ready export format is a reference copy for future BIR E-Invoicing System submission when mandatory — not currently
          transmitted to BIR. See RR 11-2024.
        </p>
      </div>

      {newInvoiceOpen && (
        <NewInvoiceDialog
          previousClients={previousClients}
          prefill={prefill}
          onClose={() => {
            setNewInvoiceOpen(false);
            setPrefill(null);
          }}
          onSaved={async () => {
            setNewInvoiceOpen(false);
            setPrefill(null);
            await load();
          }}
          onUpgradeRequired={() => {
            setNewInvoiceOpen(false);
            setUpgradeOpen(true);
          }}
        />
      )}

      {viewInvoice && <ViewInvoiceDialog invoice={viewInvoice} onClose={() => setViewInvoice(null)} />}

      {taxIncludedPrompt && (
        <Dialog open onOpenChange={() => setTaxIncludedPrompt(null)}>
          <DialogContent className="max-w-sm border-[#1E293B] bg-[#121A22]">
            <DialogHeader>
              <DialogTitle>Nice, marked as paid! 🎉</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-400">
              This invoice ({PESO(taxIncludedPrompt.total, taxIncludedPrompt.currency)}) will be included in your next 2551Q & 1701Q
              filing. Go to Taxes?
            </p>
            <DialogFooter className="gap-2">
              <Button variant="outline" className="border-[#1E293B] text-white hover:bg-white/5" onClick={() => setTaxIncludedPrompt(null)}>
                Later
              </Button>
              <a href="/dashboard/forms">
                <Button className="bg-[#22c55e] text-[#001A0D] hover:bg-[#16a34a]">Go to Taxes</Button>
              </a>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {upgradeOpen && (
        <Dialog open onOpenChange={() => setUpgradeOpen(false)}>
          <DialogContent className="max-w-sm border-[#1E293B] bg-[#121A22] text-center">
            <div className="flex flex-col items-center gap-3 py-2">
              <Lock className="h-8 w-8 text-[#22c55e]" />
              <DialogTitle>Upgrade to PRO ₱249/mo</DialogTitle>
              <p className="text-sm text-gray-400">Unlimited invoices + EIS export + custom logo.</p>
              <a href="/pricing" className="mt-1 rounded-full bg-[#22c55e] px-5 py-2.5 text-sm font-semibold text-[#001A0D] hover:bg-[#16a34a]">
                See Pricing
              </a>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function TabButton({ active, onClick, label, icon }: { active: boolean; onClick: () => void; label: string; icon?: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold transition ${
        active ? "bg-[#22c55e] text-[#001A0D]" : "border border-[#1E293B] bg-[#121A22] text-gray-400 hover:text-white"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: "green" | "amber" }) {
  const color = accent === "green" ? "text-[#22c55e]" : accent === "amber" ? "text-amber-400" : "text-white";
  return (
    <Card className={PREMIUM_CARD}>
      <CardContent className="p-5">
        <p className="text-sm font-medium text-gray-400">{label}</p>
        <p className={`mt-2 text-xl font-bold ${color}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function IconButton({ children, onClick, title, danger }: { children: React.ReactNode; onClick: () => void; title: string; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`rounded-lg p-1.5 transition ${danger ? "text-gray-500 hover:bg-red-500/10 hover:text-red-400" : "text-gray-500 hover:bg-white/5 hover:text-[#22c55e]"}`}
    >
      {children}
    </button>
  );
}

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

function Field({ label, value, onChange, placeholder, type }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-gray-400">{label}</label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="border-[#1E293B] bg-[#0B1218] text-white" />
    </div>
  );
}

interface ItemRow {
  description: string;
  qty: string;
  rate: string;
}

function SettingsPanel() {
  const [prefix, setPrefix] = useState("INV");
  const [defaultTerms, setDefaultTerms] = useState("");
  const [defaultNotes, setDefaultNotes] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetch("/api/invoices/settings")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.settings) return;
        setPrefix(data.settings.prefix ?? "INV");
        setDefaultTerms(data.settings.default_terms ?? "");
        setDefaultNotes(data.settings.default_notes ?? "");
      })
      .catch(() => {});
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/invoices/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prefix, defaultTerms, defaultNotes }),
      });
      if (res.ok) toast("Settings saved ✅");
      else toast("Couldn't save settings.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("logo", file);
      const res = await fetch("/api/invoices/logo", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Upload failed.");
        return;
      }
      setLogoPreview(data.previewUrl);
      toast("Logo uploaded ✅");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Card className={PREMIUM_CARD}>
      <CardContent className="space-y-5 p-6">
        <h2 className="text-lg font-bold text-white">Invoice Settings</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Invoice Prefix" value={prefix} onChange={setPrefix} placeholder="INV" />
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-gray-400">Pattern</label>
            <p className="rounded-lg border border-[#1E293B] bg-[#0B1218] px-3 py-2.5 text-sm text-gray-500">{prefix}-{new Date().getFullYear()}-001</p>
          </div>
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-400">Default Notes / Terms</label>
          <Textarea value={defaultNotes} onChange={(e) => setDefaultNotes(e.target.value)} className="border-[#1E293B] bg-[#0B1218] text-white" rows={2} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-400">Default Payment Terms Note</label>
          <Textarea value={defaultTerms} onChange={(e) => setDefaultTerms(e.target.value)} className="border-[#1E293B] bg-[#0B1218] text-white" rows={2} />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-400">Logo</label>
          <div className="flex items-center gap-3">
            {logoPreview && <img src={logoPreview} alt="Logo preview" className="h-12 w-12 rounded-lg border border-[#1E293B] object-contain" />}
            <label className="cursor-pointer rounded-lg border border-[#1E293B] bg-white/5 px-3 py-2 text-xs font-medium text-gray-300 hover:bg-white/10">
              {uploading ? "Uploading..." : "Upload Logo"}
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={handleLogoUpload} disabled={uploading} />
            </label>
          </div>
        </div>
        <Button onClick={handleSave} disabled={saving} className="bg-[#22c55e] text-[#001A0D] hover:bg-[#16a34a]">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Settings"}
        </Button>
      </CardContent>
    </Card>
  );
}

function NewInvoiceDialog({
  previousClients,
  prefill,
  onClose,
  onSaved,
  onUpgradeRequired,
}: {
  previousClients: string[];
  prefill: { clientName?: string; amount?: number } | null;
  onClose: () => void;
  onSaved: () => void;
  onUpgradeRequired: () => void;
}) {
  const [businessName, setBusinessName] = useState("AXLA SOFTWARE DEVELOPMENT SERVICES");
  const [businessTin, setBusinessTin] = useState("");
  const [businessAddress, setBusinessAddress] = useState("");
  const [businessEmail, setBusinessEmail] = useState("");
  const [businessPhone, setBusinessPhone] = useState("");

  const [clientName, setClientName] = useState(prefill?.clientName ?? "");
  const [clientEmail, setClientEmail] = useState("");
  const [clientTin, setClientTin] = useState("");
  const [clientAddress, setClientAddress] = useState("");

  const [dueDate, setDueDate] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("30");
  const [currency, setCurrency] = useState("PHP");

  const [items, setItems] = useState<ItemRow[]>([
    { description: "", qty: "1", rate: prefill?.amount ? String(prefill.amount) : "" },
  ]);
  const [taxType, setTaxType] = useState<"non_vat" | "vat">("non_vat");
  const [notes, setNotes] = useState("");
  const [gcash, setGcash] = useState("");
  const [maya, setMaya] = useState("");
  const [bank, setBank] = useState("");
  const [showQr, setShowQr] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [profileRes, settingsRes] = await Promise.all([fetch("/api/dashboard/profile"), fetch("/api/invoices/settings")]);
        if (profileRes.ok) {
          const data = await profileRes.json();
          if (data.profile) {
            if (data.profile.business_name) setBusinessName(data.profile.business_name);
            if (data.profile.tin_number) setBusinessTin(data.profile.tin_number);
            if (data.profile.address) setBusinessAddress(data.profile.address);
            if (data.profile.email) setBusinessEmail(data.profile.email);
          }
        }
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          if (data.settings?.default_notes) setNotes(data.settings.default_notes);
        }
      } catch {
        // Auto-fill is best-effort — the form still works with manual entry.
      }
    })();
  }, []);

  const parsedItems = items.map((it) => ({ description: it.description, qty: Number(it.qty) || 0, rate: Number(it.rate) || 0 }));
  const subtotal = parsedItems.reduce((sum, it) => sum + it.qty * it.rate, 0);
  const taxAmount = taxType === "vat" ? subtotal * 0.12 : 0;
  const total = subtotal + taxAmount;

  function updateItem(i: number, patch: Partial<ItemRow>) {
    setItems((rows) => rows.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addItem() {
    setItems((rows) => [...rows, { description: "", qty: "1", rate: "" }]);
  }
  function removeItem(i: number) {
    setItems((rows) => rows.filter((_, idx) => idx !== i));
  }

  async function save(status: "draft" | "sent") {
    if (!clientName.trim()) return setError("Client name is required.");
    if (parsedItems.every((it) => !it.description.trim())) return setError("At least one line item is required.");
    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/invoices", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientName,
          clientEmail,
          clientTin,
          clientAddress,
          businessInfo: { businessName, tin: businessTin, address: businessAddress, email: businessEmail, phone: businessPhone },
          items: parsedItems,
          taxType,
          currency,
          paymentTerms: Number(paymentTerms),
          dueDate: dueDate || null,
          notes,
          paymentDetails: { gcash, maya, bank, showQr },
          status,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "UPGRADE_REQUIRED") return onUpgradeRequired();
        setError(data.error || "Couldn't save invoice.");
        return;
      }
      toast(status === "sent" ? "Invoice saved & marked sent ✅" : "Draft saved ✅");
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto border-[#1E293B] bg-[#121A22]">
        <DialogHeader>
          <DialogTitle>New Invoice</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Your Business Info</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Business Name" value={businessName} onChange={setBusinessName} />
              <Field label="TIN" value={businessTin} onChange={setBusinessTin} />
              <Field label="Email" value={businessEmail} onChange={setBusinessEmail} />
              <Field label="Phone" value={businessPhone} onChange={setBusinessPhone} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400">Address</label>
              <Textarea value={businessAddress} onChange={(e) => setBusinessAddress(e.target.value)} className="border-[#1E293B] bg-[#0B1218] text-white" rows={2} />
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Client Info</p>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400">Client Name *</label>
              <Input value={clientName} onChange={(e) => setClientName(e.target.value)} list="previous-clients" className="border-[#1E293B] bg-[#0B1218] text-white" />
              <datalist id="previous-clients">
                {previousClients.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Client Email" value={clientEmail} onChange={setClientEmail} />
              <Field label="Client TIN (optional)" value={clientTin} onChange={setClientTin} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400">Client Address</label>
              <Textarea value={clientAddress} onChange={(e) => setClientAddress(e.target.value)} className="border-[#1E293B] bg-[#0B1218] text-white" rows={2} />
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Invoice Details</p>
            <p className="text-xs text-gray-500">Invoice # is auto-generated on save (e.g. INV-{new Date().getFullYear()}-00X).</p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-400">Due Date</label>
                <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="border-[#1E293B] bg-[#0B1218] text-white" />
              </div>
              <SelectField label="Payment Terms" value={paymentTerms} onChange={setPaymentTerms} options={PAYMENT_TERMS_OPTIONS.map((d) => ({ value: String(d), label: `Net ${d} days` }))} />
              <SelectField label="Currency" value={currency} onChange={setCurrency} options={["PHP", "USD"]} />
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Items</p>
            {items.map((item, i) => (
              <div key={i} className="grid grid-cols-12 gap-2">
                <Input
                  value={item.description}
                  onChange={(e) => updateItem(i, { description: e.target.value })}
                  placeholder="Description"
                  className="col-span-6 border-[#1E293B] bg-[#0B1218] text-white"
                />
                <Input
                  type="number"
                  min="0"
                  value={item.qty}
                  onChange={(e) => updateItem(i, { qty: e.target.value })}
                  placeholder="Qty"
                  className="col-span-2 border-[#1E293B] bg-[#0B1218] text-white"
                />
                <Input
                  type="number"
                  min="0"
                  value={item.rate}
                  onChange={(e) => updateItem(i, { rate: e.target.value })}
                  placeholder="Rate"
                  className="col-span-2 border-[#1E293B] bg-[#0B1218] text-white"
                />
                <div className="col-span-2 flex items-center gap-1">
                  <p className="flex-1 truncate text-sm text-gray-400">{PESO((Number(item.qty) || 0) * (Number(item.rate) || 0), currency)}</p>
                  {items.length > 1 && (
                    <button onClick={() => removeItem(i)} className="shrink-0 rounded p-1 text-gray-500 hover:text-red-400">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            <Button onClick={addItem} variant="outline" size="sm" className="gap-1.5 border-[#1E293B] text-white hover:bg-white/5">
              <Plus className="h-3.5 w-3.5" />
              Add Row
            </Button>

            <div className="flex justify-end">
              <div className="w-64 space-y-1.5 rounded-xl bg-white/5 p-4">
                <div className="flex justify-between text-sm text-gray-300">
                  <span>Subtotal</span>
                  <span>{PESO(subtotal, currency)}</span>
                </div>
                <div className="flex items-center gap-2">
                  {(["non_vat", "vat"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setTaxType(t)}
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${taxType === t ? "bg-[#22c55e] text-[#001A0D]" : "bg-white/10 text-gray-400"}`}
                    >
                      {t === "non_vat" ? "Non-VAT" : "VAT 12%"}
                    </button>
                  ))}
                </div>
                {taxType === "non_vat" ? (
                  <p className="text-[11px] text-gray-500">Non-VAT Registered — No VAT</p>
                ) : (
                  <div className="flex justify-between text-sm text-gray-300">
                    <span>VAT (12%)</span>
                    <span>{PESO(taxAmount, currency)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-white/10 pt-1.5 text-base font-bold text-[#22c55e]">
                  <span>Total</span>
                  <span>{PESO(total, currency)}</span>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Notes, Terms & Payment Details</p>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-gray-400">Notes / Terms</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="border-[#1E293B] bg-[#0B1218] text-white" rows={2} />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="GCash" value={gcash} onChange={setGcash} placeholder="09xx xxx xxxx" />
              <Field label="Maya" value={maya} onChange={setMaya} placeholder="09xx xxx xxxx" />
              <Field label="Bank" value={bank} onChange={setBank} placeholder="BDO 000-000-000" />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={showQr} onChange={(e) => setShowQr(e.target.checked)} className="h-4 w-4 rounded border-[#1E293B] bg-[#0B1218] accent-[#22c55e]" />
              Show QR code on PDF
            </label>
          </section>

          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" className="border-[#1E293B] text-white hover:bg-white/5" onClick={() => save("draft")} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Draft"}
          </Button>
          <Button className="bg-[#22c55e] text-[#001A0D] hover:bg-[#16a34a]" onClick={() => save("sent")} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save & Mark Sent"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ViewInvoiceDialog({ invoice, onClose }: { invoice: Invoice; onClose: () => void }) {
  async function handleSendEmail() {
    await downloadBlob(`/api/invoices/pdf?id=${invoice.id}`, `${invoice.invoice_number}.pdf`);
    const subject = encodeURIComponent(`Invoice ${invoice.invoice_number}`);
    const body = encodeURIComponent(
      `Hi ${invoice.client_name},\n\nPlease find attached invoice ${invoice.invoice_number} for ${PESO(invoice.total, invoice.currency)}.\n\n(The PDF just downloaded to your device — please attach it to this email before sending, since email links can't carry attachments automatically.)\n\nThank you!`,
    );
    window.location.href = `mailto:${invoice.client_email ?? ""}?subject=${subject}&body=${body}`;
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto border-[#1E293B] bg-[#121A22]">
        <DialogHeader>
          <DialogTitle>
            {invoice.invoice_number} {statusBadge(invoice.status)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div className="flex justify-between text-gray-400">
            <span>Client</span>
            <span className="text-white">{invoice.client_name}</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Total</span>
            <span className="font-bold text-[#22c55e]">{PESO(invoice.total, invoice.currency)}</span>
          </div>
          <div className="flex justify-between text-gray-400">
            <span>Due Date</span>
            <span className="text-white">{invoice.due_date ? new Date(invoice.due_date).toLocaleDateString("en-PH") : "—"}</span>
          </div>
          <div className="space-y-1 rounded-xl bg-white/5 p-3">
            {invoice.items.map((it, i) => (
              <div key={i} className="flex justify-between text-xs text-gray-400">
                <span>
                  {it.description} ({it.qty} × {PESO(it.rate, invoice.currency)})
                </span>
                <span className="text-gray-300">{PESO(it.amount, invoice.currency)}</span>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" className="gap-1.5 border-[#1E293B] text-white hover:bg-white/5" onClick={() => downloadBlob(`/api/invoices/pdf?id=${invoice.id}`, `${invoice.invoice_number}.pdf`)}>
            <Download className="h-3.5 w-3.5" />
            PDF
          </Button>
          <Button variant="outline" className="gap-1.5 border-[#1E293B] text-white hover:bg-white/5" onClick={handleSendEmail}>
            <Send className="h-3.5 w-3.5" />
            Send to Client
          </Button>
          <Button variant="outline" className="gap-1.5 border-[#1E293B] text-white hover:bg-white/5" onClick={() => downloadBlob(`/api/invoices/${invoice.id}/export?format=json`, `${invoice.invoice_number}-eis.json`)}>
            Export EIS JSON
          </Button>
          <Button variant="outline" className="gap-1.5 border-[#1E293B] text-white hover:bg-white/5" onClick={() => downloadBlob(`/api/invoices/${invoice.id}/export?format=csv`, `${invoice.invoice_number}.csv`)}>
            Export CSV
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
