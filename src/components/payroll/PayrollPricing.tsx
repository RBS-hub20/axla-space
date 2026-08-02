"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2 } from "lucide-react";
import { PAYROLL_PLAN_PRICING, PAYROLL_PLAN_LABELS, type PayrollPlan } from "@/lib/payroll/pricing";
import { isPayrollPromoActive } from "@/lib/payroll/promo";

interface PlanCard {
  plan: PayrollPlan;
  badge?: string;
  tagline: string;
  features: string[];
  support: string[];
  cta: string;
  highlighted?: boolean;
}

const PLAN_CARDS: PlanCard[] = [
  {
    plan: "starter",
    tagline: "Para sa maliliit na team",
    features: [
      "Up to 5 staff",
      "Manual timekeeping",
      "PDF payslip",
      "13th month calc",
      "Basic DOLE wage check (₱479 Batangas)",
    ],
    support: ["Email + Help Center", "24h reply"],
    cta: "Simulan",
  },
  {
    plan: "business",
    badge: "Most Popular",
    tagline: "Para sa lumalaking negosyo",
    highlighted: true,
    features: [
      "Up to 50 staff",
      "AI Selfie Timekeeping",
      "GCash Auto-Payslip — 1-click",
      "Auto SIL 5 days + 13th month",
      "Auto BIR 1601C + 2316 — NO FILLUP, from profile",
      "DOLE Guard Alerts",
      "History + Export",
    ],
    support: ["Live Chat Messenger — 2h reply", "Video Onboarding — 30 mins", "FB Group Access"],
    cta: "Simulan sa",
  },
  {
    plan: "enterprise",
    tagline: "Para sa malalaking operations",
    features: [
      "Unlimited staff + Multi-branch",
      "Biometrics/QR",
      "Multi-role — Owner/Manager/Staff",
      "SSS/PHIC/HDMF + Alphalist auto",
      "Custom payslip logo",
    ],
    support: ["Priority — 30 mins", "Monthly Video Review", "Dedicated Manager", "Quarterly Compliance Check"],
    cta: "Simulan",
  },
];

export function PayrollPricing() {
  const router = useRouter();
  const [loadingPlan, setLoadingPlan] = useState<PayrollPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const promoActive = isPayrollPromoActive();

  /**
   * No checkout is created from the landing page at all — clicking a plan
   * just routes to /payroll/app (via login first if needed), where the
   * in-app PayrollCheckoutModal (src/app/payroll/app/components) opens
   * automatically for that plan and handles the actual PayMongo checkout.
   * Logged-in-or-not is checked via a lightweight authed GET rather than
   * duplicating a "who am I" endpoint.
   */
  async function handleSubscribe(plan: PayrollPlan) {
    setError(null);
    setLoadingPlan(plan);
    try {
      const res = await fetch("/api/payroll/status", { cache: "no-store" });
      if (res.status === 401) {
        router.push(`/payroll/login?plan=${plan}&next=${encodeURIComponent("/payroll/app")}`);
        return;
      }
      router.push(`/payroll/app?plan=${plan}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <section id="pricing" className="border-t border-white/10 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <h2 className="text-center text-sm font-bold uppercase tracking-wide text-slate-500">Pricing</h2>
        <p className="mx-auto mt-2 max-w-lg text-center text-2xl font-extrabold text-white">Simple monthly plans, walang hidden fees</p>

        {error && (
          <div className="mx-auto mt-6 max-w-md rounded-2xl border border-red-900/60 bg-red-950/30 px-4 py-3 text-center text-sm text-red-300">
            {error}
          </div>
        )}

        <div className="mt-10 grid gap-6 lg:grid-cols-3">
          {PLAN_CARDS.map((card) => {
            const pricing = PAYROLL_PLAN_PRICING[card.plan];
            const price = promoActive ? pricing.promo : pricing.regular;
            const isLoading = loadingPlan === card.plan;
            return (
              <div
                key={card.plan}
                className={`relative flex flex-col rounded-2xl border p-8 text-left transition ${
                  card.highlighted
                    ? "border-2 border-[#00FF88] bg-white/[0.04] shadow-xl shadow-[#00FF88]/10 lg:-translate-y-2"
                    : "border-white/10 bg-white/[0.02]"
                }`}
              >
                {card.badge && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#00FF88] px-3 py-1 text-xs font-bold uppercase tracking-wide text-black">
                    {card.badge}
                  </span>
                )}
                {promoActive && (
                  <span className="absolute -top-3 right-4 rounded-full bg-red-500 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
                    50% OFF
                  </span>
                )}

                <h3 className="text-lg font-bold text-white">{PAYROLL_PLAN_LABELS[card.plan]}</h3>
                <p className="mt-1 text-sm text-slate-400">{card.tagline}</p>

                <div className="mt-4 flex items-baseline gap-2">
                  {promoActive && <span className="text-lg text-slate-500 line-through">₱{pricing.regular}</span>}
                  <span className="text-4xl font-extrabold text-white">₱{price}</span>
                  <span className="text-sm font-normal text-slate-400">/mo</span>
                </div>

                <ul className="mt-6 flex-1 space-y-2.5 text-sm text-slate-300">
                  {card.features.map((f) => (
                    <li key={f} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#00FF88]" />
                      {f}
                    </li>
                  ))}
                </ul>

                <div className="mt-5 rounded-xl border border-[#00FF88]/20 bg-[#00FF88]/[0.04] p-3.5">
                  <p className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[#00FF88]">Support</p>
                  <ul className="space-y-1 text-xs text-slate-300">
                    {card.support.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => handleSubscribe(card.plan)}
                  disabled={isLoading}
                  className={`mt-6 flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-center text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${
                    card.highlighted
                      ? "bg-[#00FF88] text-black hover:bg-[#22C55E]"
                      : "border border-[#00FF88]/40 text-[#00FF88] hover:bg-[#00FF88]/10"
                  }`}
                >
                  {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                  {card.cta} {card.plan === "business" ? `₱${price}` : ""}
                </button>
              </div>
            );
          })}
        </div>

        <p className="mt-8 text-center text-sm text-slate-500">
          💡 Yearly billing coming soon — 2 months FREE kapag yearly.
        </p>
      </div>
    </section>
  );
}
