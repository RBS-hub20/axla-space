"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, AlertTriangle, CheckCircle2 } from "lucide-react";

interface PayslipData {
  businessName: string;
  staffName: string;
  dailyRate: number;
  daysPresent: number;
  basicPay: number;
  gcash: string | null;
}

type Step = "loading" | "invalid" | "ready" | "downloaded";

const PESO = (n: number) => `₱${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

export default function EmployeePayslipPage({ params }: { params: { token: string; runId: string } }) {
  const { token, runId } = params;
  const [step, setStep] = useState<Step>("loading");
  const [data, setData] = useState<PayslipData | null>(null);

  useEffect(() => {
    fetch(`/api/payroll/employee/by-token/${token}/payslip/${runId}?t=${Date.now()}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          setStep("invalid");
          return;
        }
        const json: PayslipData = await res.json();
        setData(json);
        setStep("ready");
      })
      .catch(() => setStep("invalid"));
  }, [token, runId]);

  async function handleDownload() {
    if (!data) return;
    const { generatePayslipPdf } = await import("@/lib/payroll/payslip-pdf");
    generatePayslipPdf({ ...data, demo: false });
    setStep("downloaded");
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0a] px-4 py-10 text-white">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#1a1a1a] p-6 shadow-2xl">
        <div className="mb-5 text-center">
          <span className="text-lg font-bold text-white">
            Axla <span className="text-[#00FF88]">Payroll</span>
          </span>
        </div>

        {step === "loading" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-[#00FF88]" />
            <p className="text-sm text-gray-400">Loading your payslip...</p>
          </div>
        )}

        {step === "invalid" && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertTriangle className="h-8 w-8 text-red-400" />
            <p className="text-sm font-semibold text-white">This payslip isn&apos;t available.</p>
            <p className="text-xs text-gray-500">Ask your employer for the link again.</p>
          </div>
        )}

        {data && (step === "ready" || step === "downloaded") && (
          <div className="space-y-4">
            <div className="rounded-xl border border-[#1E293B] bg-[#0B121A] p-4">
              <p className="text-sm font-semibold text-white">{data.staffName}</p>
              <p className="mt-0.5 text-xs text-gray-500">{data.businessName}</p>
              <div className="mt-3 space-y-1 text-xs text-gray-400">
                <div className="flex justify-between">
                  <span>Daily Rate</span>
                  <span className="text-gray-200">{PESO(data.dailyRate)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Days Present</span>
                  <span className="text-gray-200">{data.daysPresent}</span>
                </div>
                <div className="flex justify-between border-t border-[#1E293B] pt-1.5 text-sm">
                  <span className="font-semibold text-white">Net Pay</span>
                  <span className="font-bold text-[#00FF88]">{PESO(data.basicPay)}</span>
                </div>
              </div>
            </div>

            {step === "downloaded" ? (
              <div className="flex flex-col items-center gap-2 py-2 text-center">
                <CheckCircle2 className="h-8 w-8 text-[#00FF88]" />
                <p className="text-sm font-semibold text-white">Downloaded ✅</p>
                <button type="button" onClick={handleDownload} className="text-xs text-gray-500 underline">
                  Download again
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleDownload}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#00FF88] py-3.5 text-sm font-bold text-black transition hover:bg-[#22C55E]"
              >
                <Download className="h-4 w-4" />
                Download Payslip PDF
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
