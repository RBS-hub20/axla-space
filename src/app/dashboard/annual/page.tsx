"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface QuarterRow {
  quarter: number;
  income: number;
  expenses: number;
  taxDue: number;
  taxType: string | null;
  hasData: boolean;
}

interface AnnualData {
  year: number;
  quarters: QuarterRow[];
  annualIncome: number;
  annualExpenses: number;
  quarterlyTaxPaid: number;
  annualGraduatedEstimate: number;
  balanceEstimate: number;
}

const PESO = (n: number) => `₱${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const CURRENT_YEAR = new Date().getFullYear();

export default function AnnualPage() {
  const [data, setData] = useState<AnnualData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    fetch(`/api/dashboard/annual?year=${CURRENT_YEAR}`, { cache: "no-store" })
      .then(async (res) => {
        const json = await res.json();
        if (res.status === 403 && json.code === "LIMIT_REACHED") {
          setLocked(true);
          return;
        }
        if (res.ok) setData(json);
      })
      .finally(() => setIsLoading(false));
  }, []);

  if (isLoading) {
    return <p className="text-sm text-slate-400">Loading...</p>;
  }

  if (locked) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
          <Lock className="h-5 w-5 text-white" />
        </div>
        <h1 className="text-xl font-bold text-white">Annual ITR summary is a Business feature</h1>
        <p className="text-sm text-slate-400">
          Upgrade to Business (₱1,499/mo) for the annual overview, multi-business support, and team access.
        </p>
        <Link
          href="/dashboard/settings"
          className="inline-block rounded-full bg-[#00FF85] px-6 py-3 text-sm font-semibold text-[#001A29] hover:bg-[#00e078]"
        >
          Upgrade to Business
        </Link>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Annual ITR Summary — {data.year}</h1>
        <p className="text-sm text-slate-400">
          Computed from your actual quarterly calculations — a working overview, not a replica of the official BIR
          1701 form. Cross-check with eBIRForms before filing.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader>
            <CardTitle>Annual Income</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-white">{PESO(data.annualIncome)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Annual Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-white">{PESO(data.annualExpenses)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Tax Paid (Quarterly)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-white">{PESO(data.quarterlyTaxPaid)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Est. Annual Balance</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${data.balanceEstimate > 0 ? "text-amber-400" : "text-[#00FF85]"}`}>
              {PESO(Math.abs(data.balanceEstimate))}
              <span className="ml-1 text-sm font-normal text-slate-400">
                {data.balanceEstimate > 0 ? "due" : "credit"}
              </span>
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Quarterly Breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {data.quarters.map((q) => (
            <div
              key={q.quarter}
              className="flex items-center justify-between rounded-lg border border-slate-800 px-4 py-3"
            >
              <div>
                <p className="text-sm font-semibold text-slate-100">Q{q.quarter} {data.year}</p>
                {q.hasData ? (
                  <p className="text-xs text-slate-400">
                    Income {PESO(q.income)} · Expenses {PESO(q.expenses)} · {q.taxType}
                  </p>
                ) : (
                  <p className="text-xs text-slate-500">No calculation recorded</p>
                )}
              </div>
              {q.hasData ? (
                <Badge variant="success">{PESO(q.taxDue)}</Badge>
              ) : (
                <Badge variant="warning">Missing</Badge>
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <p className="text-xs text-slate-500">
        ⚠️ This is a reference summary based on your Axla calculations, not an official BIR Form 1701. Graduated
        annual tax estimate: {PESO(data.annualGraduatedEstimate)}, computed on annual net income per the TRAIN law
        brackets. Validate with eBIRForms/your accountant before filing.
      </p>
    </div>
  );
}
