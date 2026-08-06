import { Check } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { DashboardMockup } from "@/components/DashboardMockup";

const MICROCOPY = ["Setup in 60 seconds", "⭐⭐⭐⭐⭐ 1,200+ early access joined", "No credit card required"];

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden bg-[#080F14] text-white">
      <div className="bg-dot-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_0%,black,transparent)]" />
      <div className="pointer-events-none absolute -right-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-[#00FF88]/20 blur-[100px]" />
      <div className="pointer-events-none absolute -left-40 top-1/2 h-96 w-96 rounded-full bg-[#22C55E]/10 blur-[100px]" />

      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 sm:px-6 sm:py-24 lg:grid-cols-2 lg:gap-8 lg:py-32">
        <Reveal className="text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-[#00FF88]">
            First agent: TaxLaya - RDO Runner (PH BIR taxes)
          </span>
          <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-[64px]">
            <span className="bg-gradient-to-r from-[#00FF88] to-[#22C55E] bg-clip-text text-transparent">
              Tax Laya
            </span>{" "}
            Starts Here.
            <br />
            File BIR in 10 seconds, not 10 hours.
          </h1>
          <p className="mx-auto mt-4 max-w-xl text-lg text-slate-400 lg:mx-0">
            Built for Filipino freelancers, agencies &amp; small businesses. No accountant needed to start.
          </p>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <a
              href="/signup"
              className="w-full rounded-full bg-[#00FF88] px-7 py-3.5 text-center text-base font-semibold text-[#080F14] shadow-lg shadow-[#00FF88]/25 transition hover:bg-[#22C55E] sm:w-auto"
            >
              Start Filing Free →
            </a>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 lg:justify-start">
            {MICROCOPY.map((item) => (
              <span key={item} className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
                <Check className="h-3.5 w-3.5 text-[#00FF88]" strokeWidth={2.5} />
                {item}
              </span>
            ))}
          </div>
        </Reveal>

        <Reveal delayMs={150} className="flex justify-center lg:justify-end">
          <DashboardMockup />
        </Reveal>
      </div>
    </section>
  );
}
