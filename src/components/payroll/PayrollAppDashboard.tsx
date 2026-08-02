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
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { PAYROLL_PLAN_LABELS, DEFAULT_DAILY_RATE, type PayrollPlan } from "@/lib/payroll/pricing";
import { DOLE_MIN_DAILY_WAGE, estimateWithholdingTax, type PayrollBreakdownRow } from "@/lib/payroll/sahod";

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

export function PayrollAppDashboard({ businessName, plan }: { businessName: string; plan: PayrollPlan }) {
  const router = useRouter();
  const [staff, setStaff] = useState<Staff[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isComputing, setIsComputing] = useState(false);
  const [clockingId, setClockingId] = useState<string | null>(null);

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [staffName, setStaffName] = useState("");
  const [staffGcash, setStaffGcash] = useState("");
  const [staffRate, setStaffRate] = useState(String(DEFAULT_DAILY_RATE));

  const [previewRun, setPreviewRun] = useState<PayrollRun | null>(null);

  const load = useCallback(async () => {
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
    load();
  }, [load]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
    router.refresh();
  }

  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!staffName.trim()) {
      setFormError("Staff name is required.");
      return;
    }
    const rate = Number(staffRate);
    if (!Number.isFinite(rate) || rate <= 0) {
      setFormError("Daily rate must be a positive number.");
      return;
    }
    setIsSaving(true);
    try {
      const res = await fetch("/api/payroll/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: staffName.trim(), gcash: staffGcash.trim(), dailyRate: rate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Failed to add staff.");
        return;
      }
      setIsAddOpen(false);
      setStaffName("");
      setStaffGcash("");
      setStaffRate(String(DEFAULT_DAILY_RATE));
      toast("Staff added ✅");
      await load();
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRemoveStaff(id: string) {
    try {
      const res = await fetch(`/api/payroll/staff/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast("Staff removed");
        await load();
      }
    } catch {
      toast("Network error — try again.");
    }
  }

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
        await load();
      } else {
        const data = await res.json();
        toast(data.error || "Failed to record attendance.");
      }
    } catch {
      toast("Network error — try again.");
    } finally {
      setClockingId(null);
    }
  }

  async function handleCompute() {
    setIsComputing(true);
    try {
      const res = await fetch("/api/payroll/runs/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month: currentMonthKey() }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Failed to compute sahod.");
        return;
      }
      toast("Sahod computed ✅");
      setPreviewRun(data.run);
      await load();
    } catch {
      toast("Network error — try again.");
    } finally {
      setIsComputing(false);
    }
  }

  const todayIso = new Date().toISOString().slice(0, 10);
  const todaysAttendanceByStaff = useMemo(() => {
    const map = new Map<string, AttendanceRow>();
    for (const row of attendance) {
      if (row.date === todayIso) map.set(row.staff_id, row);
    }
    return map;
  }, [attendance, todayIso]);

  const doleWarnings = useMemo(() => staff.filter((s) => Number(s.daily_rate) < DOLE_MIN_DAILY_WAGE), [staff]);
  const latestRun = runs[0];
  const totalCompensation = latestRun?.breakdown?.reduce((sum, r) => sum + r.basicPay, 0) ?? 0;
  const estimatedWithholding = estimateWithholdingTax(totalCompensation);

  return (
    <div className="min-h-screen bg-[#080F14] text-white">
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-white/10 bg-[#001A29]/95 px-4 backdrop-blur sm:px-6">
        <div className="flex items-center gap-2">
          <span className="text-base font-bold text-white">
            Axla <span className="text-[#00FF88]">Payroll</span>
          </span>
          <span className="hidden text-sm text-slate-400 sm:inline">— {businessName}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="rounded-full bg-[#00FF88]/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#00FF88]">
            {PAYROLL_PLAN_LABELS[plan]}
          </span>
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

      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        {/* KPIs */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className={`${PREMIUM_CARD} p-5`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-400">Total Staff</p>
              <Users className="h-4 w-4 text-[#00FF88]" />
            </div>
            <p className="mt-2 text-2xl font-bold text-white">{isLoading ? "—" : staff.length}</p>
          </div>
          <div className={`${PREMIUM_CARD} p-5`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-400">Latest Sahod Run</p>
              <Wallet className="h-4 w-4 text-[#00FF88]" />
            </div>
            <p className="mt-2 text-2xl font-bold text-white">{isLoading ? "—" : latestRun ? PESO(latestRun.total_sahod) : "—"}</p>
          </div>
          <div className={`${PREMIUM_CARD} p-5`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-400">Est. BIR 1601C</p>
              <FileText className="h-4 w-4 text-[#00FF88]" />
            </div>
            <p className="mt-2 text-2xl font-bold text-white">{isLoading ? "—" : PESO(estimatedWithholding)}</p>
          </div>
          <div className={`${PREMIUM_CARD} p-5`}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-gray-400">DOLE Warnings</p>
              <AlertTriangle className="h-4 w-4 text-amber-400" />
            </div>
            <p className="mt-2 text-2xl font-bold text-white">{isLoading ? "—" : doleWarnings.length}</p>
          </div>
        </div>

        {doleWarnings.length > 0 && (
          <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div>
                <p className="text-sm font-semibold text-amber-300">DOLE Guard — below reference minimum wage (₱{DOLE_MIN_DAILY_WAGE}/day)</p>
                <p className="mt-1 text-xs text-amber-300/80">
                  {doleWarnings.map((s) => s.name).join(", ")} — verify against your actual regional wage order.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Staff */}
        <Card className={PREMIUM_CARD}>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-semibold text-white">Staff</CardTitle>
            <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
              <Button size="sm" onClick={() => setIsAddOpen(true)}>
                <Plus className="h-4 w-4" />
                Add Staff
              </Button>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Staff</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleAddStaff} className="space-y-3">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-300">Name</label>
                    <Input value={staffName} onChange={(e) => setStaffName(e.target.value)} placeholder="Juan Dela Cruz" className="border-[#1E293B] bg-[#0B121A]" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-300">GCash Number</label>
                    <Input value={staffGcash} onChange={(e) => setStaffGcash(e.target.value)} placeholder="09171234567" className="border-[#1E293B] bg-[#0B121A]" />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-slate-300">Daily Rate</label>
                    <Input type="number" min="0" step="0.01" value={staffRate} onChange={(e) => setStaffRate(e.target.value)} className="border-[#1E293B] bg-[#0B121A]" />
                    <p className="mt-1 text-xs text-gray-500">Auto-suggested ₱{DEFAULT_DAILY_RATE} (Batangas reference minimum wage) — adjust as needed.</p>
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
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-12 w-full animate-pulse rounded-lg bg-white/5" />
                ))}
              </div>
            ) : staff.length === 0 ? (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Users className="h-10 w-10 text-[#00FF88]" />
                <p className="text-sm font-semibold text-white">Wala pang staff. Add mo na!</p>
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
                      <th className="pb-2 pr-4">Today</th>
                      <th className="pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((s) => {
                      const today = todaysAttendanceByStaff.get(s.id);
                      const isClocking = clockingId === s.id;
                      return (
                        <tr key={s.id} className="border-b border-[#1E293B]/60 last:border-0">
                          <td className="py-3 pr-4 font-medium text-white">{s.name}</td>
                          <td className="py-3 pr-4 text-gray-300">{s.gcash || "—"}</td>
                          <td className={`py-3 pr-4 ${Number(s.daily_rate) < DOLE_MIN_DAILY_WAGE ? "text-amber-400" : "text-gray-300"}`}>
                            {PESO(s.daily_rate)}
                          </td>
                          <td className="py-3 pr-4">
                            {today?.time_in && today?.time_out ? (
                              <Badge variant="success">Complete</Badge>
                            ) : today?.time_in ? (
                              <Badge variant="warning">Timed In</Badge>
                            ) : (
                              <Badge>Not yet</Badge>
                            )}
                          </td>
                          <td className="py-3">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <button
                                type="button"
                                disabled={isClocking || Boolean(today?.time_in)}
                                onClick={() => handleClock(s.id, "in")}
                                className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#00FF88]/30 px-2 text-xs text-[#00FF88] hover:bg-[#00FF88]/10 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <Clock className="h-3 w-3" />
                                Time In
                              </button>
                              <button
                                type="button"
                                disabled={isClocking || !today?.time_in || Boolean(today?.time_out)}
                                onClick={() => handleClock(s.id, "out")}
                                className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#1E293B] px-2 text-xs text-slate-200 hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {isClocking ? <Loader2 className="h-3 w-3 animate-spin" /> : <Camera className="h-3 w-3" />}
                                Time Out
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveStaff(s.id)}
                                className="inline-flex h-7 items-center gap-1 rounded-lg border border-red-900/40 px-2 text-xs text-red-300 hover:bg-red-950/30"
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <p className="mt-3 text-xs text-gray-500">
                  <Camera className="mr-1 inline h-3 w-3" />
                  Selfie capture is a placeholder in this phase — timekeeping records the timestamp only.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payroll Runs */}
        <Card className={PREMIUM_CARD}>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-semibold text-white">Payroll Runs</CardTitle>
            <Button size="sm" onClick={handleCompute} disabled={isComputing || staff.length === 0}>
              {isComputing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
              {isComputing ? "Computing..." : `Compute Sahod (${currentMonthKey()})`}
            </Button>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="h-12 w-full animate-pulse rounded-lg bg-white/5" />
            ) : runs.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">No payroll runs yet — add staff, log timekeeping, then compute.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#1E293B] text-left text-xs uppercase tracking-wide text-gray-500">
                      <th className="pb-2 pr-4">Month</th>
                      <th className="pb-2 pr-4">Total Sahod</th>
                      <th className="pb-2 pr-4">Status</th>
                      <th className="pb-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {runs.map((r) => (
                      <tr key={r.id} className="border-b border-[#1E293B]/60 last:border-0">
                        <td className="py-3 pr-4 font-medium text-white">{r.month}</td>
                        <td className="py-3 pr-4 text-gray-300">{PESO(r.total_sahod)}</td>
                        <td className="py-3 pr-4">
                          <Badge variant="success">{r.status === "finalized" ? "Finalized" : "Draft"}</Badge>
                        </td>
                        <td className="py-3">
                          <button
                            type="button"
                            onClick={() => setPreviewRun(r)}
                            className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#1E293B] px-2 text-xs text-slate-200 hover:bg-white/5"
                          >
                            <FileText className="h-3 w-3" />
                            View Payslips
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-xs text-gray-600">
          Basic pay only in this phase (no overtime, no SSS/PHIC/HDMF deductions) — BIR 1601C figure is an illustrative estimate, not an
          official computation. Verify with your accountant before filing.
        </p>
      </div>

      {previewRun && <PayslipPreviewModal run={previewRun} onClose={() => setPreviewRun(null)} />}
    </div>
  );
}

function PayslipPreviewModal({ run, onClose }: { run: PayrollRun; onClose: () => void }) {
  const totalWithholding = estimateWithholdingTax(run.total_sahod);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[#1E293B] bg-[#121A22] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#1E293B] px-5 py-4">
          <h2 className="text-base font-bold text-white">Payroll Run — {run.month}</h2>
          <button type="button" onClick={onClose} className="text-gray-500 hover:text-gray-300" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="rounded-xl border border-[#00FF88]/30 bg-[#00FF88]/[0.04] p-4">
            <p className="text-xs font-bold uppercase tracking-wide text-[#00FF88]">BIR 1601C — Estimate</p>
            <div className="mt-2 space-y-1 text-sm text-gray-300">
              <div className="flex justify-between">
                <span>Total Compensation</span>
                <span className="font-medium text-white">{PESO(run.total_sahod)}</span>
              </div>
              <div className="flex justify-between">
                <span>Estimated Withholding Tax</span>
                <span className="font-medium text-white">{PESO(totalWithholding)}</span>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-gray-500">Illustrative estimate only — verify against the BIR withholding table.</p>
          </div>

          <div>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">GCash Payslips</p>
            <div className="space-y-2">
              {run.breakdown.map((row) => (
                <div key={row.staffId} className="rounded-xl border border-[#1E293B] bg-[#0B121A] p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-white">{row.name}</p>
                    <CheckCircle2 className="h-4 w-4 text-[#00FF88]" />
                  </div>
                  <div className="mt-2 space-y-1 text-xs text-gray-400">
                    <div className="flex justify-between">
                      <span>Days Present</span>
                      <span className="text-gray-200">{row.daysPresent}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Daily Rate</span>
                      <span className="text-gray-200">{PESO(row.dailyRate)}</span>
                    </div>
                    <div className="flex justify-between border-t border-[#1E293B] pt-1.5 text-sm">
                      <span className="font-semibold text-white">Net Pay</span>
                      <span className="font-bold text-[#00FF88]">{PESO(row.basicPay)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[11px] text-gray-500">
              Preview only — no GCash disbursement is sent from this dashboard. Send payment manually via your GCash app.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
