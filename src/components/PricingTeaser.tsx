import Link from "next/link";
import { Check } from "lucide-react";
import { PLAN_PRICING } from "@/lib/plans";
import { Reveal } from "@/components/Reveal";

const FREE_FEATURES = ["1 filing per quarter", "5 receipt scans per month", "5 TaxLaya AI chats per day"];
const PRO_FEATURES = ["Unlimited filings, scans & AI chat", "1-click eBIR auto-fill", "Tax Forecast & Income Dashboard"];
const BUSINESS_FEATURES = ["Everything in Pro", "Up to 5 TINs & 5 users", "Client Management Portal"];

export function PricingTeaser() {
  return (
    <section className="bg-[#080F14] py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Simple pricing</h2>
          <p className="mt-3 text-lg text-slate-400">
            Free forever, or go unlimited at <span className="font-semibold text-[#00FF88]">₱499</span>/mo
          </p>
        </Reveal>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          <Reveal>
            <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-7 transition hover:border-white/20">
              <h3 className="font-bold text-white">Free</h3>
              <p className="mt-3 text-3xl font-extrabold text-white">
                ₱0<span className="text-sm font-normal text-slate-500">/mo</span>
              </p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm text-slate-400">
                {FREE_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>

          <Reveal delayMs={100}>
            <div className="group relative flex h-full flex-col rounded-2xl border-2 border-[#00FF88]/60 bg-[#00FF88]/[0.04] p-7 shadow-[0_0_60px_-15px_rgba(0,255,136,0.35)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_0_80px_-10px_rgba(0,255,136,0.5)]">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-[#00FF88] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#080F14]">
                Best Value
              </span>
              <h3 className="font-bold text-white">Pro</h3>
              <p className="mt-3 text-3xl font-extrabold text-white">
                ₱{PLAN_PRICING.pro.monthly}
                <span className="text-sm font-normal text-slate-400">/mo</span>
              </p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm text-slate-300">
                {PRO_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#00FF88]" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link
                href="/pricing"
                className="mt-6 rounded-full bg-[#00FF88] px-6 py-3 text-center text-sm font-semibold text-[#080F14] transition hover:bg-[#22C55E]"
              >
                See Pro details
              </Link>
            </div>
          </Reveal>

          <Reveal delayMs={200}>
            <div className="flex h-full flex-col rounded-2xl border border-white/10 bg-white/[0.03] p-7 transition hover:border-white/20">
              <h3 className="font-bold text-white">Business</h3>
              <p className="mt-3 text-3xl font-extrabold text-white">
                ₱{PLAN_PRICING.business.monthly.toLocaleString()}
                <span className="text-sm font-normal text-slate-500">/mo</span>
              </p>
              <ul className="mt-5 flex-1 space-y-2.5 text-sm text-slate-400">
                {BUSINESS_FEATURES.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
        </div>

        <p className="mt-10 text-center">
          <Link href="/pricing" className="text-sm font-medium text-slate-400 underline-offset-4 hover:text-[#00FF88] hover:underline">
            See full comparison →
          </Link>
        </p>
      </div>
    </section>
  );
}
