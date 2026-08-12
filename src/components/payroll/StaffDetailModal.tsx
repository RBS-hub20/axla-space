"use client";

import { useEffect, useRef, useState } from "react";
import { Camera, Copy, QrCode, Loader2, Plus, Trash2, FileText, Upload, CheckCircle2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Staff, AttendanceRow } from "@/components/payroll/PayrollAppDashboard";
import { EMPLOYMENT_TYPES, RATE_TYPES, RATE_TYPE_LABELS, STAFF_STATUSES, type RateType } from "@/lib/payroll/staff-fields";
import { computeAttendanceStats } from "@/lib/payroll/attendance-stats";
import { PESO, resolveRateAmount, resolveRateType } from "@/lib/payroll/format";
import { DEFAULT_DAILY_RATE } from "@/lib/payroll/pricing";

const CLOCK_LINK_ORIGIN = "https://axla.space";

export type DetailTab = "personal" | "government" | "payroll" | "attendance" | "advances" | "documents";

const DETAIL_TABS: { id: DetailTab; label: string }[] = [
  { id: "personal", label: "Personal" },
  { id: "government", label: "Government" },
  { id: "payroll", label: "Payroll" },
  { id: "attendance", label: "Attendance" },
  { id: "advances", label: "Advances" },
  { id: "documents", label: "Documents" },
];

interface CashAdvance {
  id: string;
  amount: number;
  reason: string | null;
  status: "pending" | "paid" | "deducted";
  created_at: string;
}

interface StaffDocument {
  id: string;
  name: string;
  file_type: string | null;
  created_at: string;
  signed_url: string | null;
}

const FIELD_LABEL = "mb-1 block text-sm font-medium text-slate-300";
const FIELD_INPUT = "border-[#1E293B] bg-[#0B121A]";

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

export function StaffDetailModal({
  staff,
  initialTab = "personal",
  attendanceThisMonth,
  onClose,
  onChanged,
  onToast,
}: {
  staff: Staff;
  initialTab?: DetailTab;
  attendanceThisMonth: AttendanceRow[];
  onClose: () => void;
  onChanged: (updated: Staff) => void;
  onToast: (message: string) => void;
}) {
  const [activeTab, setActiveTab] = useState<DetailTab>(initialTab);
  const [current, setCurrent] = useState(staff);

  async function patchStaff(body: Record<string, unknown>): Promise<boolean> {
    try {
      const res = await fetch(`/api/payroll/staff/${current.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast(data.error || "Failed to save.");
        return false;
      }
      const updated = { ...current, ...data.staff };
      setCurrent(updated);
      onChanged(updated);
      return true;
    } catch {
      onToast("Network error. Please try again.");
      return false;
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <StaffDetailHeader staff={current} onSaved={(updated) => { setCurrent(updated); onChanged(updated); }} onToast={onToast} />

        <div className="mt-4 flex gap-1 overflow-x-auto border-b border-[#1E293B]">
          {DETAIL_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`shrink-0 border-b-2 px-3 py-2 text-xs font-semibold transition ${
                activeTab === t.id ? "border-[#8BFF00] text-[#8BFF00]" : "border-transparent text-gray-400 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="mt-4 max-h-[55vh] overflow-y-auto pr-1">
          {activeTab === "personal" && <PersonalTab staff={current} onSave={patchStaff} />}
          {activeTab === "government" && <GovernmentTab staff={current} onSave={patchStaff} />}
          {activeTab === "payroll" && <PayrollTab staff={current} onSave={patchStaff} />}
          {activeTab === "attendance" && <AttendanceTab staff={current} attendanceThisMonth={attendanceThisMonth} />}
          {activeTab === "advances" && <AdvancesTab staffId={current.id} onToast={onToast} />}
          {activeTab === "documents" && <DocumentsTab staffId={current.id} onToast={onToast} />}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StaffDetailHeader({ staff, onSaved, onToast }: { staff: Staff; onSaved: (s: Staff) => void; onToast: (m: string) => void }) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState(staff.name);
  const [position, setPosition] = useState(staff.position ?? "");

  useEffect(() => {
    setName(staff.name);
    setPosition(staff.position ?? "");
  }, [staff.id, staff.name, staff.position]);

  async function saveField(field: "name" | "position", value: string) {
    try {
      const res = await fetch(`/api/payroll/staff/${staff.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      const data = await res.json();
      if (res.ok) onSaved({ ...staff, ...data.staff });
    } catch {
      // best-effort inline save — the field just won't persist, no need to interrupt the modal with an error
    }
  }

  async function handleStatusChange(status: string) {
    const res = await fetch(`/api/payroll/staff/${staff.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const data = await res.json();
    if (res.ok) onSaved({ ...staff, ...data.staff });
  }

  async function handleAvatarFile(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("avatar", file);
      const res = await fetch(`/api/payroll/staff/${staff.id}/avatar`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        onToast(data.error || "Photo upload failed.");
        return;
      }
      onSaved({ ...staff, avatar_signed_url: data.previewUrl ?? null, avatar_url: data.avatarPath ?? staff.avatar_url });
      onToast("Photo updated ✅");
    } catch {
      onToast("Network error. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0">
        {staff.avatar_signed_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage URL, not a static/optimizable asset
          <img src={staff.avatar_signed_url} alt={`${staff.name} photo`} className="h-14 w-14 rounded-full border border-[#00FF88]/40 object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#8BFF00] text-lg font-bold text-black">{getInitials(staff.name)}</div>
        )}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          aria-label="Upload staff photo"
          className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-[#0F1F15] bg-[#00FF88] text-black transition hover:bg-[#22C55E] disabled:opacity-60"
        >
          {uploading ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Camera className="h-2.5 w-2.5" />}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleAvatarFile(file);
            e.target.value = "";
          }}
        />
      </div>

      <div className="min-w-0 flex-1 space-y-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== staff.name && saveField("name", name.trim())}
          className="w-full truncate bg-transparent text-lg font-bold text-white outline-none focus:border-b focus:border-[#00FF88]/40"
        />
        <input
          value={position}
          onChange={(e) => setPosition(e.target.value)}
          onBlur={() => position !== (staff.position ?? "") && saveField("position", position)}
          placeholder="Position (e.g. Cashier, Crew, Driver)"
          className="w-full truncate bg-transparent text-xs text-gray-400 outline-none placeholder:text-gray-600 focus:border-b focus:border-[#00FF88]/40"
        />
      </div>

      <select
        value={staff.status}
        onChange={(e) => handleStatusChange(e.target.value)}
        className="h-8 shrink-0 rounded-lg border border-[#1E293B] bg-[#0B121A] px-2 text-xs font-semibold text-white outline-none focus:border-[#00FF88]"
      >
        {STAFF_STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </div>
  );
}

function SaveBar({ isSaving, error, onSave }: { isSaving: boolean; error: string | null; onSave: () => void }) {
  return (
    <div className="flex items-center justify-between pt-1">
      {error ? <p className="text-xs text-red-300">{error}</p> : <span />}
      <Button size="sm" onClick={onSave} disabled={isSaving}>
        {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
        {isSaving ? "Saving..." : "Save"}
      </Button>
    </div>
  );
}

function PersonalTab({ staff, onSave }: { staff: Staff; onSave: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [phone, setPhone] = useState(staff.phone ?? "");
  const [gcash, setGcash] = useState(staff.gcash ?? "");
  const [address, setAddress] = useState(staff.address ?? "");
  const [hiredAt, setHiredAt] = useState(staff.hired_at ?? "");
  const [schedule, setSchedule] = useState(staff.schedule ?? "");
  const [employmentType, setEmploymentType] = useState(staff.employment_type);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const link = staff.clock_token ? `${CLOCK_LINK_ORIGIN}/c/${staff.clock_token}` : null;

  async function handleCopy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
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

  async function handleSave() {
    setError(null);
    setIsSaving(true);
    const ok = await onSave({ phone, gcash, address, hiredAt: hiredAt || null, schedule, employmentType });
    setIsSaving(false);
    if (!ok) setError("Failed to save — try again.");
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={FIELD_LABEL}>Phone</label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="09171234567" className={FIELD_INPUT} />
        </div>
        <div>
          <label className={FIELD_LABEL}>GCash Number</label>
          <Input value={gcash} onChange={(e) => setGcash(e.target.value)} placeholder="09171234567" className={FIELD_INPUT} />
        </div>
      </div>
      <div>
        <label className={FIELD_LABEL}>Address</label>
        <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, Barangay, City" className={FIELD_INPUT} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={FIELD_LABEL}>Hired Date</label>
          <Input type="date" value={hiredAt} onChange={(e) => setHiredAt(e.target.value)} className={FIELD_INPUT} />
        </div>
        <div>
          <label className={FIELD_LABEL}>Employment Type</label>
          <select
            value={employmentType}
            onChange={(e) => setEmploymentType(e.target.value)}
            className="flex h-10 w-full rounded-md border border-[#1E293B] bg-[#0B121A] px-3 text-sm text-white outline-none focus:border-[#00FF88]"
          >
            {EMPLOYMENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div>
        <label className={FIELD_LABEL}>Schedule</label>
        <Input value={schedule} onChange={(e) => setSchedule(e.target.value)} placeholder="Mon-Sat 9AM-6PM" className={FIELD_INPUT} />
      </div>

      <SaveBar isSaving={isSaving} error={error} onSave={handleSave} />

      <div className="rounded-xl border border-[#1E293B] bg-white/5 p-3">
        <p className="text-xs font-semibold text-gray-400">AI Selfie Clock Link</p>
        {link ? (
          <div className="mt-2 flex items-center gap-2">
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
          <p className="mt-1 text-xs text-gray-600">No clock link yet.</p>
        )}
      </div>
    </div>
  );
}

function GovernmentTab({ staff, onSave }: { staff: Staff; onSave: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [sssNo, setSssNo] = useState(staff.sss_no ?? "");
  const [philhealthNo, setPhilhealthNo] = useState(staff.philhealth_no ?? "");
  const [pagibigNo, setPagibigNo] = useState(staff.pagibig_no ?? "");
  const [tinNo, setTinNo] = useState(staff.tin_no ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    setIsSaving(true);
    const ok = await onSave({ sssNo, philhealthNo, pagibigNo, tinNo });
    setIsSaving(false);
    if (!ok) setError("Failed to save — try again.");
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={FIELD_LABEL}>SSS Number</label>
          <Input value={sssNo} onChange={(e) => setSssNo(e.target.value)} placeholder="34-1234567-8" className={FIELD_INPUT} />
        </div>
        <div>
          <label className={FIELD_LABEL}>PhilHealth Number</label>
          <Input value={philhealthNo} onChange={(e) => setPhilhealthNo(e.target.value)} placeholder="12-345678901-2" className={FIELD_INPUT} />
        </div>
        <div>
          <label className={FIELD_LABEL}>Pag-IBIG Number</label>
          <Input value={pagibigNo} onChange={(e) => setPagibigNo(e.target.value)} placeholder="1234-5678-9012" className={FIELD_INPUT} />
        </div>
        <div>
          <label className={FIELD_LABEL}>TIN</label>
          <Input value={tinNo} onChange={(e) => setTinNo(e.target.value)} placeholder="123-456-789-000" className={FIELD_INPUT} />
        </div>
      </div>
      <SaveBar isSaving={isSaving} error={error} onSave={handleSave} />
    </div>
  );
}

function PayrollTab({ staff, onSave }: { staff: Staff; onSave: (body: Record<string, unknown>) => Promise<boolean> }) {
  const [rateType, setRateType] = useState<RateType>(resolveRateType(staff.rate_type));
  const [rateAmount, setRateAmount] = useState(String(resolveRateAmount(staff.rate_amount, staff.daily_rate) || DEFAULT_DAILY_RATE));
  const [commissionPct, setCommissionPct] = useState(staff.commission_pct !== null ? String(staff.commission_pct) : "");
  const [bankName, setBankName] = useState(staff.bank_name ?? "");
  const [bankAccountNo, setBankAccountNo] = useState(staff.bank_account_no ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setError(null);
    const amount = Number(rateAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Rate must be a positive number.");
      return;
    }
    setIsSaving(true);
    const ok = await onSave({
      rateType,
      rateAmount: amount,
      commissionPct: commissionPct.trim() === "" ? null : Number(commissionPct),
      bankName,
      bankAccountNo,
    });
    setIsSaving(false);
    if (!ok) setError("Failed to save — try again.");
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={FIELD_LABEL}>Rate Type</label>
          <select
            value={rateType}
            onChange={(e) => setRateType(e.target.value as RateType)}
            className="flex h-10 w-full rounded-md border border-[#1E293B] bg-[#0B121A] px-3 text-sm text-white outline-none focus:border-[#00FF88]"
          >
            {RATE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t[0].toUpperCase() + t.slice(1)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={FIELD_LABEL}>Amount ({RATE_TYPE_LABELS[rateType]})</label>
          <Input type="number" min="0" step="0.01" value={rateAmount} onChange={(e) => setRateAmount(e.target.value)} className={FIELD_INPUT} />
        </div>
      </div>
      {rateType !== "daily" && (
        <p className="rounded-lg border border-amber-900/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-300">
          Payroll Run currently computes daily-rate × days-present only — {rateType} staff show correctly here, but aren't yet included when you compute a
          run.
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={FIELD_LABEL}>Commission %</label>
          <Input type="number" min="0" max="100" step="0.1" value={commissionPct} onChange={(e) => setCommissionPct(e.target.value)} placeholder="Optional" className={FIELD_INPUT} />
        </div>
        <div />
        <div>
          <label className={FIELD_LABEL}>Bank Name</label>
          <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="BDO, BPI, etc." className={FIELD_INPUT} />
        </div>
        <div>
          <label className={FIELD_LABEL}>Bank Account No.</label>
          <Input value={bankAccountNo} onChange={(e) => setBankAccountNo(e.target.value)} className={FIELD_INPUT} />
        </div>
      </div>
      <SaveBar isSaving={isSaving} error={error} onSave={handleSave} />
    </div>
  );
}

function AttendanceTab({ staff, attendanceThisMonth }: { staff: Staff; attendanceThisMonth: AttendanceRow[] }) {
  const rows = attendanceThisMonth.filter((r) => r.staff_id === staff.id).sort((a, b) => b.date.localeCompare(a.date));
  const stats = computeAttendanceStats(rows, staff.schedule);

  if (rows.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">No attendance data yet this month.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[#1E293B] bg-white/5 p-3 text-center">
          <p className="text-xl font-bold text-white">{stats.daysPresent}</p>
          <p className="text-xs text-gray-500">Days This Month</p>
        </div>
        {stats.onTimePct !== null && (
          <div className="rounded-xl border border-[#1E293B] bg-white/5 p-3 text-center">
            <p className="text-xl font-bold text-[#00FF88]">{stats.onTimePct}%</p>
            <p className="text-xs text-gray-500">On Time</p>
          </div>
        )}
        {stats.lateCount !== null && (
          <div className="rounded-xl border border-[#1E293B] bg-white/5 p-3 text-center">
            <p className="text-xl font-bold text-red-400">{stats.lateCount}</p>
            <p className="text-xs text-gray-500">Late</p>
          </div>
        )}
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-lg border border-[#1E293B]/60 px-3 py-2 text-xs">
            <span className="text-gray-300">{r.date}</span>
            <span className="text-gray-500">
              {r.time_in ? new Date(r.time_in).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }) : "—"}
              {r.time_out ? ` – ${new Date(r.time_out).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}` : ""}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdvancesTab({ staffId, onToast }: { staffId: string; onToast: (m: string) => void }) {
  const [advances, setAdvances] = useState<CashAdvance[] | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  async function load() {
    const res = await fetch(`/api/payroll/staff/${staffId}/advances`, { cache: "no-store" });
    if (res.ok) setAdvances((await res.json()).advances ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load() only needs staffId, and re-declaring it as a stable useCallback for a fetch-once-per-tab-open effect adds indirection with no benefit here
  }, [staffId]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      onToast("Enter a valid amount.");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch(`/api/payroll/staff/${staffId}/advances`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: amt, reason }),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast(data.error || "Failed to record advance.");
        return;
      }
      setAmount("");
      setReason("");
      onToast("Cash advance recorded ✅");
      load();
    } finally {
      setIsSaving(false);
    }
  }

  async function markPaid(id: string) {
    const res = await fetch(`/api/payroll/staff/${staffId}/advances/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "paid" }),
    });
    if (res.ok) load();
  }

  async function remove(id: string) {
    const res = await fetch(`/api/payroll/staff/${staffId}/advances/${id}`, { method: "DELETE" });
    if (res.ok) load();
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2 rounded-xl border border-[#1E293B] bg-white/5 p-3">
        <div className="flex-1">
          <label className={FIELD_LABEL}>Amount</label>
          <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} className={FIELD_INPUT} />
        </div>
        <div className="flex-[2]">
          <label className={FIELD_LABEL}>Reason (optional)</label>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Emergency, medical, etc." className={FIELD_INPUT} />
        </div>
        <Button type="submit" size="sm" disabled={isSaving}>
          {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
          Add
        </Button>
      </form>

      {advances === null ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-[#00FF88]" />
        </div>
      ) : advances.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">No cash advances recorded.</p>
      ) : (
        <div className="space-y-1.5">
          {advances.map((a) => (
            <div key={a.id} className="flex items-center justify-between rounded-lg border border-[#1E293B]/60 px-3 py-2 text-sm">
              <div>
                <p className="font-medium text-white">{PESO(a.amount)}</p>
                <p className="text-xs text-gray-500">
                  {a.reason || "No reason given"} • {new Date(a.created_at).toLocaleDateString("en-PH")}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                    a.status === "pending" ? "bg-amber-500/15 text-amber-400" : "bg-[#00FF88]/15 text-[#00FF88]"
                  }`}
                >
                  {a.status}
                </span>
                {a.status === "pending" && (
                  <button type="button" onClick={() => markPaid(a.id)} title="Mark as paid" className="text-gray-500 hover:text-[#00FF88]">
                    <CheckCircle2 className="h-4 w-4" />
                  </button>
                )}
                <button type="button" onClick={() => remove(a.id)} title="Remove" className="text-gray-500 hover:text-red-400">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DocumentsTab({ staffId, onToast }: { staffId: string; onToast: (m: string) => void }) {
  const [docs, setDocs] = useState<StaffDocument[] | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch(`/api/payroll/staff/${staffId}/documents`, { cache: "no-store" });
    if (res.ok) setDocs((await res.json()).documents ?? []);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- load() only needs staffId, and re-declaring it as a stable useCallback for a fetch-once-per-tab-open effect adds indirection with no benefit here
  }, [staffId]);

  async function handleFile(file: File) {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name);
      const res = await fetch(`/api/payroll/staff/${staffId}/documents`, { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        onToast(data.error || "Upload failed.");
        return;
      }
      onToast("Document uploaded ✅");
      load();
    } finally {
      setUploading(false);
    }
  }

  async function remove(id: string) {
    const res = await fetch(`/api/payroll/staff/${staffId}/documents/${id}`, { method: "DELETE" });
    if (res.ok) load();
  }

  return (
    <div className="space-y-4">
      <div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />
        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {uploading ? "Uploading..." : "Upload Document"}
        </Button>
        <p className="mt-1 text-xs text-gray-500">PDF, JPEG, PNG, or WebP — up to 10MB. IDs, contracts, certificates.</p>
      </div>

      {docs === null ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-4 w-4 animate-spin text-[#00FF88]" />
        </div>
      ) : docs.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">No documents uploaded.</p>
      ) : (
        <div className="space-y-1.5">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center justify-between rounded-lg border border-[#1E293B]/60 px-3 py-2 text-sm">
              <a
                href={d.signed_url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-w-0 items-center gap-2 text-slate-200 hover:text-[#00FF88]"
              >
                <FileText className="h-4 w-4 shrink-0" />
                <span className="truncate">{d.name}</span>
              </a>
              <button type="button" onClick={() => remove(d.id)} title="Remove" className="shrink-0 text-gray-500 hover:text-red-400">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
