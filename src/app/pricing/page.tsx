"use client";

import { useState } from "react";
import Link from "next/link";
import { Check, X } from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { PromoCountdown } from "@/components/PromoCountdown";
import { PLAN_PRICING, type BillingCycle } from "@/lib/plans";
import { PROMO, isPromoActive } from "@/lib/promo";
import { cn } from "@/lib/utils";

const FREE_FEATURES = [
  "1 filing per quarter",
  "5 receipt scans per month",
  "5 TaxLaya AI chats per day",
  "Basic filing calendar",
  "Community support only",
];

const PRO_FEATURES = [
  "UNLIMITED filings (1701Q, 2551Q, 1701A)",
  "UNLIMITED receipt scans",
  "UNLIMITED TaxLaya AI chat",
  "Auto computation",
  "1-click eBIR auto-fill",
  "Tax Forecast",
  "Income Dashboard",
  "Expense Tracker",
  "BIR Invoices",
  "Priority 24h support",
];

const BUSINESS_FEATURES = [
  "Everything in Pro",
  "Up to 5 TINs/Branches",
  "Up to 5 team members",
  "Client Management Portal (20 clients)",
  "BIR 2307 / Alphalist generation",
  "Custom reports",
  "2h support + quarterly 30-min call",
];

const COMPARISON_ROWS: Array<{ label: string; free: string; pro: string; business: string }> = [
  { label: "Filings per quarter", free: "1", pro: "Unlimited", business: "Unlimited" },
  { label: "Receipt scans per month", free: "5", pro: "Unlimited", business: "Unlimited" },
  { label: "TaxLaya AI chats per day", free: "5", pro: "Unlimited", business: "Unlimited" },
  { label: "1-click eBIR auto-fill", free: "—", pro: "✓", business: "✓" },
  { label: "Tax Forecast & Income Dashboard", free: "—", pro: "✓", business: "✓" },
  { label: "BIR Invoices", free: "—", pro: "✓", business: "✓" },
  { label: "TINs / Branches", free: "1", pro: "1", business: "Up to 5" },
  { label: "Team members", free: "1", pro: "1", business: "Up to 5" },
  { label: "Client Management Portal", free: "—", pro: "—", business: "20 clients" },
  { label: "BIR 2307 / Alphalist", free: "—", pro: "—", business: "✓" },
  { label: "Support", free: "Community", pro: "Priority 24h", business: "2h + quarterly call" },
];

function Cell({ value }: { value: string }) {
  if (value === "✓") return <Check className="mx-auto h-4 w-4 text-accent" />;
  if (value === "—") return <X className="mx-auto h-4 w-4 text-slate-300" />;
  return <span>{value}</span>;
}

export default function PricingPage() {
  const [cycle, setCycle] = useState<BillingCycle>("monthly");

  return (
    <main>
      <div className="sticky top-0 z-50">
        <PromoCountdown />
        <Navbar />
      </div>

      <section className="bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
          <h1 className="text-3xl font-extrabold tracking-tight text-navy sm:text-5xl">
            Simple, transparent pricing
          </h1>
          <p className="mt-4 text-lg text-slate-600">
            Start free. Upgrade kapag kailangan na — walang hidden fees, walang bitin.
          </p>

          <div className="mt-8 flex justify-center">
            <div className="flex gap-1 rounded-full border border-slate-200 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setCycle("monthly")}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-semibold transition",
                  cycle === "monthly" ? "bg-navy text-white" : "text-slate-500 hover:text-navy",
                )}
              >
                Monthly
              </button>
              <button
                type="button"
                onClick={() => setCycle("yearly")}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-semibold transition",
                  cycle === "yearly" ? "bg-navy text-white" : "text-slate-500 hover:text-navy",
                )}
              >
                Yearly <span className="text-accent">(2 months free)</span>
              </button>
            </div>
          </div>

          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {/* Free */}
            <div className="flex flex-col rounded-2xl border border-slate-200 p-8 text-left">
              <h2 className="text-lg font-bold text-navy">Free</h2>
              <p className="mt-3 text-4xl font-extrabold text-navy">
                ₱0<span className="text-base font-normal text-slate-500">/mo</span>
              </p>
              <p className="mt-1 text-sm text-slate-500">Para sa nagsisimula pa lang</p>
              <ul className="mt-6 flex-1 space-y-3 text-sm text-slate-700">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    {f}
                  </li>
                ))}
                <li className="flex items-start gap-2 text-slate-400">
                  <X className="mt-0.5 h-4 w-4 shrink-0" />
                  No auto eBIR fill
                </li>
              </ul>
              <Link
                href="/login"
                className="mt-8 rounded-full border border-navy px-6 py-3 text-center text-sm font-semibold text-navy transition hover:bg-navy hover:text-white"
              >
                Get started free
              </Link>
            </div>

            {/* Pro */}
            <div className="relative flex flex-col rounded-2xl border-2 border-accent bg-navy p-8 text-left shadow-xl shadow-accent/10">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-accent px-3 py-1 text-xs font-bold uppercase tracking-wide text-navy">
                {cycle === "monthly" && isPromoActive() ? "50% OFF — 60 DAYS ONLY" : "Best Value"}
              </span>
              <h2 className="text-lg font-bold text-white">Pro</h2>
              {cycle === "monthly" && isPromoActive() ? (
                <p className="mt-3 flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-white">₱{PROMO.proPricePesos}</span>
                  <span className="text-base font-normal text-slate-400">/mo</span>
                  <span className="text-lg font-medium text-slate-400 line-through">₱{PLAN_PRICING.pro.monthly}</span>
                </p>
              ) : (
                <p className="mt-3 text-4xl font-extrabold text-white">
                  ₱{PLAN_PRICING.pro[cycle].toLocaleString()}
                  <span className="text-base font-normal text-slate-400">/{cycle === "monthly" ? "mo" : "yr"}</span>
                </p>
              )}
              <p className="mt-1 text-sm text-slate-400">
                {cycle === "yearly" ? `₱4,990/yr — 2 months free` : "For solo freelancers ready to scale"}
              </p>
              <ul className="mt-6 flex-1 space-y-3 text-sm text-slate-200">
                {PRO_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href={cycle === "monthly" && isPromoActive() ? "/dashboard/settings?promo=LAUNCH50" : "/dashboard/settings"}
                className="mt-8 rounded-full bg-accent px-6 py-3 text-center text-sm font-semibold text-navy transition hover:bg-accent-dark"
              >
                {cycle === "monthly" && isPromoActive() ? "Claim 50% OFF Now →" : "Upgrade to Pro"}
              </Link>
            </div>

            {/* Business */}
            <div className="relative flex flex-col rounded-2xl border border-slate-200 p-8 text-left">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-navy px-3 py-1 text-xs font-bold uppercase tracking-wide text-white">
                For Teams
              </span>
              <h2 className="text-lg font-bold text-navy">Business</h2>
              <p className="mt-3 text-4xl font-extrabold text-navy">
                ₱{PLAN_PRICING.business[cycle].toLocaleString()}
                <span className="text-base font-normal text-slate-500">/{cycle === "monthly" ? "mo" : "yr"}</span>
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {cycle === "yearly" ? "₱14,990/yr — 2 months free" : "For teams and accounting firms"}
              </p>
              <ul className="mt-6 flex-1 space-y-3 text-sm text-slate-700">
                {BUSINESS_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/dashboard/settings"
                className="mt-8 rounded-full border border-navy px-6 py-3 text-center text-sm font-semibold text-navy transition hover:bg-navy hover:text-white"
              >
                Upgrade to Business
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-16 sm:py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <h2 className="text-center text-2xl font-extrabold text-navy sm:text-3xl">Compare plans</h2>
          <div className="mt-10 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left">
                  <th className="px-4 py-3 font-semibold text-slate-500">Feature</th>
                  <th className="px-4 py-3 text-center font-semibold text-navy">Free</th>
                  <th className="px-4 py-3 text-center font-semibold text-navy">Pro</th>
                  <th className="px-4 py-3 text-center font-semibold text-navy">Business</th>
                </tr>
              </thead>
              <tbody>
                {COMPARISON_ROWS.map((row) => (
                  <tr key={row.label} className="border-b border-slate-100 last:border-0">
                    <td className="px-4 py-3 text-slate-700">{row.label}</td>
                    <td className="px-4 py-3 text-center text-slate-600">
                      <Cell value={row.free} />
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">
                      <Cell value={row.pro} />
                    </td>
                    <td className="px-4 py-3 text-center text-slate-600">
                      <Cell value={row.business} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-6 text-center text-sm text-slate-500">
            Mas mura pa sa BIR penalty na ₱1,000 — 1,200+ freelancers naka-Pro na.
          </p>
        </div>
      </section>

      <Footer />
    </main>
  );
}
