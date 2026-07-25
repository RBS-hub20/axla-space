"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Upload, Loader2, TrendingUp, TrendingDown, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { UpgradeWallModal, type UpgradeWallType } from "@/components/dashboard/UpgradeWallModal";
import { FeatureBadge } from "@/components/dashboard/FeatureBadge";

interface Transaction {
  id: string;
  transaction_date: string;
  description: string;
  amount: number;
  type: "income" | "expense";
}

const PESO = (n: number) => `₱${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const CARD = "rounded-2xl border-[#1E293B] bg-[#121A22] shadow-sm transition hover:border-[#22c55e]/30 hover:shadow-lg hover:shadow-green-500/10";

export default function UploadPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totals, setTotals] = useState({ totalIncome: 0, totalExpenses: 0 });
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [upgradeWall, setUpgradeWall] = useState<{ type: UpgradeWallType; message: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password modal — opens when the server reports the file is protected.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/dashboard/transactions", { cache: "no-store" });
      const data = await res.json();
      if (res.ok) {
        setTransactions(data.transactions);
        setTotals({ totalIncome: data.totalIncome, totalExpenses: data.totalExpenses });
        // Cached for the BIR Forms quick-preview calculator so it can
        // instant-fill gross income without a round trip on first paint.
        if (Number.isFinite(data.totalIncome) && data.totalIncome > 0) {
          localStorage.setItem("last_gcash_income", String(data.totalIncome));
        }
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function uploadFile(file: File, filePassword?: string) {
    setError(null);
    setNotice(null);
    setIsUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      if (filePassword) form.append("password", filePassword);

      const res = await fetch("/api/dashboard/transactions", { method: "POST", body: form });
      const data = await res.json();

      if (!res.ok) {
        if (data.isProtected) {
          setPendingFile(file);
          setPasswordError(filePassword ? data.error || "Incorrect password." : null);
          return;
        }
        if (res.status === 403 && data.code === "LIMIT_REACHED") {
          setUpgradeWall({ type: data.type, message: data.message });
          return;
        }
        setError(data.error || "Upload failed.");
        return;
      }

      setPendingFile(null);
      setPassword("");
      setPasswordError(null);
      setNotice(
        `Imported ${data.imported} transactions.${data.skippedRows ? ` Skipped ${data.skippedRows} unreadable rows.` : ""}`,
      );
      await load();
    } catch {
      setError("Network error during upload.");
    } finally {
      setIsUploading(false);
      setIsUnlocking(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) uploadFile(file);
  }

  async function handleUnlock(e: React.FormEvent) {
    e.preventDefault();
    if (!pendingFile || !password) return;
    setIsUnlocking(true);
    await uploadFile(pendingFile, password);
  }

  function closePasswordModal() {
    setPendingFile(null);
    setPassword("");
    setPasswordError(null);
  }

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#080F14] px-4 py-6 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Transaction Upload</h1>
          <p className="text-sm text-slate-400">
            Upload GCash (CSV or PDF), Maya (CSV), or a bank statement (BPI/BDO/UnionBank — CSV or XLSX) — Axla
            auto-detects the source and categorizes income vs expenses.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-[#1E293B] px-2.5 py-1 text-xs font-medium text-slate-300">GCash</span>
            <span className="flex items-center gap-1.5 rounded-full border border-[#1E293B] px-2.5 py-1 text-xs font-medium text-slate-300">
              Maya <FeatureBadge />
            </span>
            <span className="flex items-center gap-1.5 rounded-full border border-[#1E293B] px-2.5 py-1 text-xs font-medium text-slate-300">
              BPI / BDO / UnionBank <FeatureBadge />
            </span>
          </div>
          <p className="mt-2 text-xs font-medium text-[#22c55e]">
            Now supports Maya wallet, BPI/BDO/UnionBank CSV/XLSX — no reformat needed!
          </p>
        </div>

        <Card
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          className={`${CARD} ${isDragging ? "border-[#22c55e]" : ""}`}
        >
          <CardContent className="flex flex-col items-center justify-center gap-3 py-10 text-center">
            <Upload className="h-8 w-8 text-slate-500" />
            <p className="text-sm text-slate-300">Drag & drop your GCash, Maya, or bank statement here, or</p>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex items-center gap-2 rounded-lg bg-[#22c55e] px-4 py-2 text-sm font-semibold text-[#001A29] transition hover:bg-[#1fb854] disabled:opacity-50"
            >
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {isUploading ? "Parsing..." : "Choose file"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,.pdf,application/pdf,.xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) uploadFile(file);
                e.target.value = "";
              }}
            />
            <p className="text-xs text-slate-500">
              GCash (CSV/PDF), Maya (CSV), BPI/BDO/UnionBank (CSV/XLSX) supported — auto-detected by file name and
              headers. Password-protected GCash statement PDFs are supported too.
            </p>
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-2xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</div>
        )}
        {notice && (
          <div className="rounded-2xl border border-[#22c55e]/30 bg-[#22c55e]/10 px-4 py-3 text-sm text-[#22c55e]">
            {notice}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Card className={CARD}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-gray-400">Total Income</CardTitle>
              <TrendingUp className="h-4 w-4 text-[#22c55e]" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-white">{PESO(totals.totalIncome)}</p>
            </CardContent>
          </Card>
          <Card className={CARD}>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-medium text-gray-400">Total Expenses</CardTitle>
              <TrendingDown className="h-4 w-4 text-amber-400" />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-white">{PESO(totals.totalExpenses)}</p>
            </CardContent>
          </Card>
        </div>

        <Card className={CARD}>
          <CardHeader>
            <CardTitle className="text-white">Transactions ({transactions.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="h-8 w-full animate-pulse rounded bg-white/5" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Type</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {transactions.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="py-8 text-center text-slate-500">
                        No transactions yet. Upload a GCash CSV or PDF to get started.
                      </TableCell>
                    </TableRow>
                  ) : (
                    transactions.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="text-slate-400">
                          {new Date(t.transaction_date).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-slate-200">{t.description}</TableCell>
                        <TableCell className={t.type === "income" ? "text-[#22c55e]" : "text-slate-300"}>
                          {t.type === "income" ? "+" : "-"}
                          {PESO(t.amount)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={t.type === "income" ? "success" : "default"}>{t.type}</Badge>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <UpgradeWallModal
          open={Boolean(upgradeWall)}
          onClose={() => setUpgradeWall(null)}
          type={upgradeWall?.type ?? null}
          message={upgradeWall?.message ?? null}
        />

        {pendingFile && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={closePasswordModal}>
            <div
              className="w-full max-w-sm rounded-2xl border border-[#1E293B] bg-[#121A22] p-6 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2">
                <Lock className="h-5 w-5 text-[#22c55e]" />
                <h2 className="text-lg font-bold text-white">Protected GCash File</h2>
              </div>
              <p className="mt-2 text-sm text-gray-400">Enter password to unlock</p>

              <form onSubmit={handleUnlock} className="mt-4 space-y-3">
                <Input
                  type="password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="e.g. SOMBILON1234"
                  className="border-[#1E293B] bg-[#0B121A]"
                />
                <p className="text-xs text-gray-500">
                  Format: LASTNAME + last 4 digits (e.g., SOMBILON1234) — check GCash email
                </p>

                {passwordError && (
                  <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-xs text-red-300">
                    {passwordError}
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  <Button
                    type="submit"
                    disabled={!password || isUnlocking}
                    className="flex-1 bg-[#22c55e] text-[#001A29] hover:bg-[#1fb854]"
                  >
                    {isUnlocking ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {isUnlocking ? "Unlocking..." : "Unlock"}
                  </Button>
                  <Button type="button" variant="outline" className="border-[#1E293B]" onClick={closePasswordModal}>
                    Cancel
                  </Button>
                </div>

                <p className="pt-1 text-center text-[11px] text-gray-500">
                  Forgot format? It&apos;s your Last Name + last 4 digits of your GCash number.
                </p>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
