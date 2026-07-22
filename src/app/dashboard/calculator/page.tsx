"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type TaxType = "8%" | "3%" | "itemized";

interface CalcResult {
  id: string;
  taxDue: number;
  baseTax: number;
  surcharge: number;
  interest: number;
  isLate: boolean;
  dueDate: string;
  breakdown: string[];
}

interface BusinessOption {
  id: string;
  name: string;
  is_primary: boolean;
}

interface CompareResult {
  eightPercent: CalcResult;
  graduated: CalcResult;
  savings: number;
  recommended: "8%" | "itemized";
}

const now = new Date();
const CURRENT_QUARTER = (Math.floor(now.getMonth() / 3) + 1) as 1 | 2 | 3 | 4;
const CURRENT_YEAR = now.getFullYear();

const PESO = (n: number) => `₱${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function TaxCalculatorPage() {
  const router = useRouter();
  const [income, setIncome] = useState("");
  const [expenses, setExpenses] = useState("");
  const [taxType, setTaxType] = useState<TaxType>("8%");
  const [quarter, setQuarter] = useState<number>(CURRENT_QUARTER);
  const [year, setYear] = useState<number>(CURRENT_YEAR);
  const [businesses, setBusinesses] = useState<BusinessOption[]>([]);
  const [businessId, setBusinessId] = useState<string>("");
  const [result, setResult] = useState<CalcResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [compareResult, setCompareResult] = useState<CompareResult | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/dashboard/businesses", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (data.businesses) {
          setBusinesses(data.businesses);
          const primary = data.businesses.find((b: BusinessOption) => b.is_primary);
          if (primary) setBusinessId(primary.id);
        }
      })
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/dashboard/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          income: Number(income),
          expenses: Number(expenses || 0),
          taxType,
          quarter,
          year,
          businessId: businessId || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong.");
        return;
      }

      setResult(data);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCompare() {
    setCompareError(null);
    setCompareResult(null);
    setIsComparing(true);
    try {
      const res = await fetch("/api/dashboard/calculate/compare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          income: Number(income),
          expenses: Number(expenses || 0),
          quarter,
          year,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCompareError(data.error || "Something went wrong.");
        return;
      }
      setCompareResult(data);
    } catch {
      setCompareError("Network error. Please try again.");
    } finally {
      setIsComparing(false);
    }
  }

  const cardClass =
    "rounded-2xl border-[#1E293B] bg-[#121A22] shadow-sm transition hover:border-[#22c55e]/30 hover:shadow-lg hover:shadow-green-500/10";

  return (
    <div className="-mx-4 -my-6 min-h-[calc(100vh-4rem)] bg-[#080F14] px-4 py-6 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <h1 className="text-2xl font-bold text-white">Tax Calculator</h1>

        <Card className={cardClass}>
          <CardHeader>
            <CardTitle className="text-white">Compute your quarterly tax</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {businesses.length > 0 && (
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300">Business</label>
                  <select
                    value={businessId}
                    onChange={(e) => setBusinessId(e.target.value)}
                    className="h-10 w-full rounded-lg border border-[#1E293B] bg-[#0B121A] px-3 text-sm text-slate-100"
                  >
                    {businesses.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                        {b.is_primary ? " (Primary)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-300">Tax type</label>
                <div className="grid grid-cols-3 gap-2">
                  {(["8%", "3%", "itemized"] as TaxType[]).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setTaxType(type)}
                      className={`rounded-lg border px-3 py-2 text-sm font-semibold transition ${
                        taxType === type
                          ? "border-[#22c55e] bg-[#22c55e]/10 text-[#22c55e]"
                          : "border-[#1E293B] text-slate-300 hover:bg-white/5"
                      }`}
                    >
                      {type === "8%" ? "8%" : type === "3%" ? "3% (non-VAT)" : "Itemized"}
                    </button>
                  ))}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  8% — simple flat rate for freelancers/professionals under ₱3M. 3% — percentage tax,
                  no deductions. Itemized — graduated rates with deductible expenses (usually for
                  higher-income or corporate filers).
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300">Income (gross)</label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    required
                    value={income}
                    onChange={(e) => setIncome(e.target.value)}
                    placeholder="e.g. 150000"
                    className="border-[#1E293B] bg-[#0B121A]"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300">
                    Expenses {taxType !== "itemized" && <span className="text-slate-500">(unused for {taxType})</span>}
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={expenses}
                    onChange={(e) => setExpenses(e.target.value)}
                    placeholder="e.g. 20000"
                    disabled={taxType !== "itemized"}
                    className="border-[#1E293B] bg-[#0B121A]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300">Quarter</label>
                  <select
                    value={quarter}
                    onChange={(e) => setQuarter(Number(e.target.value))}
                    className="h-10 w-full rounded-lg border border-[#1E293B] bg-[#0B121A] px-3 text-sm text-slate-100"
                  >
                    {[1, 2, 3, 4].map((q) => (
                      <option key={q} value={q}>
                        Q{q}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-slate-300">Year</label>
                  <Input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(Number(e.target.value))}
                    className="border-[#1E293B] bg-[#0B121A]"
                  />
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">
                  {error}
                </div>
              )}

              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? "Computing..." : "Compute tax"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={isComparing || !income}
                onClick={handleCompare}
                className="w-full border-[#1E293B]"
              >
                {isComparing ? "Comparing..." : "What-if: Compare 8% vs Graduated"}
              </Button>
            </form>
          </CardContent>
        </Card>

        {compareError && (
          <div className="rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">
            {compareError}
          </div>
        )}

        {compareResult && (
          <Card className={cardClass}>
            <CardHeader>
              <CardTitle className="text-white">8% vs Graduated — What-If</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div
                  className={`rounded-lg border p-4 ${
                    compareResult.recommended === "8%" ? "border-[#22c55e] bg-[#22c55e]/5" : "border-[#1E293B]"
                  }`}
                >
                  <p className="text-sm font-medium text-slate-300">8% Flat Rate</p>
                  <p className="mt-1 text-xl font-bold text-white">{PESO(compareResult.eightPercent.taxDue)}</p>
                </div>
                <div
                  className={`rounded-lg border p-4 ${
                    compareResult.recommended === "itemized" ? "border-[#22c55e] bg-[#22c55e]/5" : "border-[#1E293B]"
                  }`}
                >
                  <p className="text-sm font-medium text-slate-300">Graduated (Itemized)</p>
                  <p className="mt-1 text-xl font-bold text-white">{PESO(compareResult.graduated.taxDue)}</p>
                </div>
              </div>

              {compareResult.savings > 0 ? (
                <div className="rounded-lg border border-[#22c55e]/30 bg-[#22c55e]/10 px-4 py-3 text-center">
                  <p className="text-lg font-bold text-[#22c55e]">
                    You save {PESO(compareResult.savings)} with {compareResult.recommended === "8%" ? "8%" : "Graduated"}!
                  </p>
                </div>
              ) : (
                <p className="text-center text-sm text-slate-400">Both options come out about the same this quarter.</p>
              )}

              <p className="text-xs text-slate-500">
                ⚠️ Simplified per-quarter estimate for comparison only — not saved. Graduated only makes sense once
                your deductible expenses are high enough to offset the loss of the flat 8% simplicity.
              </p>
            </CardContent>
          </Card>
        )}

        {result && (
          <Card className={cardClass}>
            <CardHeader>
              <CardTitle className="text-white">Breakdown</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-1 text-sm text-slate-300">
                {result.breakdown.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>

              {result.isLate && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-900/60 bg-amber-950/30 px-3 py-2 text-sm text-amber-300">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                  <div>
                    <p>
                      Past the {new Date(result.dueDate).toLocaleDateString("en-PH", { month: "long", day: "numeric" })}{" "}
                      deadline — 25% surcharge + prorated 12% annual interest added.
                    </p>
                    <p className="mt-1 text-xs">
                      Surcharge: {PESO(result.surcharge)} · Interest: {PESO(result.interest)}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-[#1E293B] pt-3">
                <span className="text-sm font-medium text-slate-300">Total due</span>
                <span className="text-xl font-bold text-[#22c55e]">{PESO(result.taxDue)}</span>
              </div>

              <p className="text-xs text-slate-500">
                ⚠️ Simplified per-quarter estimate, not a substitute for your accountant&apos;s
                cumulative computation. Saved to your calculations — head to BIR Forms to generate a
                filing from this.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
