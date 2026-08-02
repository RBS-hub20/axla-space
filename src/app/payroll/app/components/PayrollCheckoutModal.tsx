"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, X } from "lucide-react";
import { PAYROLL_PLANS, PAYROLL_PLAN_PRICING, PAYROLL_PLAN_LABELS, type PayrollPlan } from "@/lib/payroll/pricing";
import { isPayrollPromoActive } from "@/lib/payroll/promo";

const CHECKOUT_STORAGE_KEY = "axla_payroll_checkout";
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

const PLAN_FEATURES: Record<PayrollPlan, string[]> = {
  starter: ["Up to 5 staff", "Manual timekeeping", "PDF payslip", "13th month calc"],
  business: ["Up to 50 staff", "AI Selfie Timekeeping", "GCash Auto-Payslip", "Auto BIR 1601C + 2316", "DOLE Guard Alerts"],
  enterprise: ["Unlimited staff + Multi-branch", "Biometrics/QR", "SSS/PHIC/HDMF + Alphalist", "Custom payslip logo"],
};

/**
 * In-app purchase — no navigation away from /payroll/app. PayMongo checkout
 * opens in a new tab; this modal polls the existing
 * /api/payroll/checkout/confirm (same endpoint the old full-page redirect
 * flow uses) until it reports paid, then hands the new plan back via
 * onSuccess so the dashboard can unlock immediately — no logout/refresh
 * needed. Polling, not Supabase Realtime: this codebase has no realtime
 * subscriptions set up anywhere else, and polling a synchronous
 * status-check endpoint is simpler and just as fast in practice (PayMongo
 * checkout completion is a single user action, not a long wait).
 */
export function PayrollCheckoutModal({
  open,
  onClose,
  preselectedPlan,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  preselectedPlan?: PayrollPlan;
  onSuccess: (plan: PayrollPlan) => void;
}) {
  const [selectedPlan, setSelectedPlan] = useState<PayrollPlan>(preselectedPlan ?? "business");
  const [isCreating, setIsCreating] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollHandle = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollDeadline = useRef<number>(0);

  useEffect(() => {
    if (preselectedPlan) setSelectedPlan(preselectedPlan);
  }, [preselectedPlan]);

  useEffect(() => {
    return () => {
      if (pollHandle.current) clearInterval(pollHandle.current);
    };
  }, []);

  function stopPolling() {
    if (pollHandle.current) {
      clearInterval(pollHandle.current);
      pollHandle.current = null;
    }
    setIsPolling(false);
  }

  async function pollOnce(checkoutSessionId: string): Promise<boolean> {
    try {
      const res = await fetch("/api/payroll/checkout/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ checkoutSessionId }),
      });
      const data = await res.json();
      if (res.ok && data.paid) {
        sessionStorage.removeItem(CHECKOUT_STORAGE_KEY);
        stopPolling();
        onSuccess(data.plan as PayrollPlan);
        return true;
      }
    } catch {
      // transient network error while polling — keep trying until the deadline
    }
    return false;
  }

  function startPolling(checkoutSessionId: string) {
    setIsPolling(true);
    pollDeadline.current = Date.now() + POLL_TIMEOUT_MS;
    pollHandle.current = setInterval(async () => {
      if (Date.now() > pollDeadline.current) {
        stopPolling();
        setError("Still waiting for payment confirmation — click \"I've paid\" below to check again.");
        return;
      }
      await pollOnce(checkoutSessionId);
    }, POLL_INTERVAL_MS);
  }

  async function handlePay() {
    setError(null);
    setIsCreating(true);
    try {
      const res = await fetch("/api/payroll/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: selectedPlan }),
      });
      const data = await res.json();
      if (!res.ok || !data.checkoutUrl) {
        setError(data.error || "Couldn't start checkout. Please try again.");
        return;
      }
      sessionStorage.setItem(CHECKOUT_STORAGE_KEY, JSON.stringify({ checkoutSessionId: data.checkoutSessionId, plan: selectedPlan }));
      window.open(data.checkoutUrl, "_blank", "noopener,noreferrer");
      startPolling(data.checkoutSessionId);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleManualCheck() {
    const raw = sessionStorage.getItem(CHECKOUT_STORAGE_KEY);
    if (!raw) {
      setError("No pending checkout found — click Pay to start again.");
      return;
    }
    try {
      const { checkoutSessionId } = JSON.parse(raw);
      if (!checkoutSessionId) return;
      setError(null);
      const paid = await pollOnce(checkoutSessionId);
      if (!paid) {
        setError("Not confirmed yet — finish paying in the other tab, then click this again.");
        startPolling(checkoutSessionId);
      }
    } catch {
      setError("Couldn't check payment status. Please try again.");
    }
  }

  function handleClose() {
    stopPolling();
    setError(null);
    onClose();
  }

  if (!open) return null;

  const promoActive = isPayrollPromoActive();
  const pricing = PAYROLL_PLAN_PRICING[selectedPlan];
  const price = promoActive ? pricing.promo : pricing.regular;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={handleClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#1E293B] bg-[#121A22] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#1E293B] px-5 py-4">
          <h2 className="text-base font-bold text-white">Unlock Axla Payroll</h2>
          <button type="button" onClick={handleClose} className="text-gray-500 hover:text-gray-300" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {isPolling ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Loader2 className="h-8 w-8 animate-spin text-[#00FF88]" />
              <p className="text-sm font-semibold text-white">Waiting for payment confirmation...</p>
              <p className="max-w-sm text-xs text-gray-500">
                Finish paying in the tab that just opened — this closes automatically once we see it. Don&apos;t close this window.
              </p>
              {error && <p className="text-xs text-amber-400">{error}</p>}
              <button
                type="button"
                onClick={handleManualCheck}
                className="mt-2 rounded-full border border-[#00FF88]/40 px-4 py-2 text-xs font-semibold text-[#00FF88] hover:bg-[#00FF88]/10"
              >
                I&apos;ve paid — check now
              </button>
              <button type="button" onClick={stopPolling} className="text-xs text-gray-500 hover:text-gray-300">
                Cancel
              </button>
            </div>
          ) : (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                {PAYROLL_PLANS.map((plan) => {
                  const planPricing = PAYROLL_PLAN_PRICING[plan];
                  const planPrice = promoActive ? planPricing.promo : planPricing.regular;
                  const isSelected = plan === selectedPlan;
                  return (
                    <button
                      key={plan}
                      type="button"
                      onClick={() => setSelectedPlan(plan)}
                      className={`flex flex-col rounded-xl border p-4 text-left transition ${
                        isSelected ? "border-[#00FF88] bg-[#00FF88]/[0.06]" : "border-[#1E293B] hover:border-[#00FF88]/30"
                      }`}
                    >
                      <span className="text-sm font-bold text-white">{PAYROLL_PLAN_LABELS[plan]}</span>
                      <span className="mt-1 text-xl font-extrabold text-[#00FF88]">
                        ₱{planPrice}
                        <span className="text-xs font-normal text-gray-400">/mo</span>
                      </span>
                      <ul className="mt-2 space-y-1 text-[11px] text-gray-400">
                        {PLAN_FEATURES[plan].map((f) => (
                          <li key={f} className="flex items-start gap-1">
                            <Check className="mt-0.5 h-3 w-3 shrink-0 text-[#00FF88]" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    </button>
                  );
                })}
              </div>

              {error && (
                <div className="mt-4 rounded-lg border border-red-900/60 bg-red-950/30 px-3 py-2 text-sm text-red-300">{error}</div>
              )}

              <button
                type="button"
                onClick={handlePay}
                disabled={isCreating}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-[#00FF88] px-6 py-3.5 text-sm font-semibold text-black transition hover:bg-[#22C55E] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isCreating && <Loader2 className="h-4 w-4 animate-spin" />}
                {isCreating ? "Starting checkout..." : `Pay ₱${price}/mo — ${PAYROLL_PLAN_LABELS[selectedPlan]}`}
              </button>
              <p className="mt-2 text-center text-xs text-gray-500">Opens PayMongo checkout in a new tab — come back here after paying.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
