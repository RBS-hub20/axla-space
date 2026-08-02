import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { PayrollPromoCountdown } from "@/components/payroll/PayrollPromoCountdown";
import { PayrollPricing } from "@/components/payroll/PayrollPricing";
import { PAYROLL_PLANS, type PayrollPlan } from "@/lib/payroll/pricing";

export const metadata = {
  title: "Axla Payroll — Payroll & Compliance Agent | Axla",
  description:
    "Hindi mo na kailangan mag manual payslip. Auto compute sahod, 13th month, at BIR 1601C — GCash payslip, DOLE Guard, at auto compliance para sa negosyo mo.",
};

const HOW_IT_WORKS = [
  { step: "1", title: "Mag-sign up", desc: "Libre mag browse — walang credit card kailangan para tignan." },
  { step: "2", title: "Idagdag ang staff", desc: "Pangalan, GCash number, daily rate — 2 minutes lang per staff." },
  { step: "3", title: "I-compute ang sahod", desc: "Auto payslip, auto BIR 1601C, DOLE-compliant agad." },
];

function isPayrollPlan(value: string | undefined): value is PayrollPlan {
  return typeof value === "string" && (PAYROLL_PLANS as string[]).includes(value);
}

export default function PayrollPage({ searchParams }: { searchParams: { plan?: string } }) {
  const autoPlan = isPayrollPlan(searchParams.plan) ? searchParams.plan : undefined;

  return (
    <main className="bg-[#0B0F1A] text-white">
      <div className="sticky top-0 z-50">
        <PayrollPromoCountdown />
        <Navbar />
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-[#00FF88]/20 blur-[100px]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:gap-8 lg:py-28">
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#052E1F] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#00FF88]">
              Live Now
            </span>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">Axla Payroll</h1>
            <p className="mt-3 text-xl font-semibold text-[#00FF88] sm:text-2xl">Pasahod, Payslip &amp; DOLE Agent</p>
            <p className="mx-auto mt-4 max-w-xl text-lg text-slate-400 lg:mx-0">
              Hindi mo na kailangan mag manual payslip. Auto compute sahod, 13th month, at BIR 1601C!
            </p>

            <div className="mx-auto mt-6 flex max-w-md flex-wrap justify-center gap-4 text-xs font-medium text-slate-300 lg:mx-0 lg:justify-start">
              <span className="flex items-center gap-1.5">
                <span className="text-[#00FF88]">✓</span> No Manual
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[#00FF88]">✓</span> GCash Payslip
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[#00FF88]">✓</span> DOLE Guard
              </span>
            </div>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Link
                href="#pricing"
                className="w-full rounded-full bg-[#00FF88] px-7 py-3.5 text-center text-base font-semibold text-black shadow-lg shadow-[#00FF88]/25 transition hover:bg-[#22C55E] sm:w-auto"
              >
                Gumawa ng Payroll — Libre mag browse
              </Link>
              <a
                href="#paano"
                className="w-full rounded-full border border-white/20 px-7 py-3.5 text-center text-base font-semibold text-white transition hover:border-[#00FF88]/50 hover:text-[#00FF88] sm:w-auto"
              >
                Paano gumagana?
              </a>
            </div>
          </div>

          {/* Mockup */}
          <div className="hidden lg:block">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#11172A] shadow-2xl">
              <div className="flex items-center justify-between bg-[#00FF88] px-5 py-3">
                <span className="text-sm font-bold text-black">Double R Water - Payroll</span>
                <span className="text-xs font-semibold text-black/70">Dashboard</span>
              </div>
              <div className="grid grid-cols-2 gap-3 p-5">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs text-slate-400">Total Sahod</p>
                  <p className="mt-1 text-xl font-bold text-white">₱23,950</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs text-slate-400">Staff</p>
                  <p className="mt-1 text-xl font-bold text-[#00FF88]">5 active</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs text-slate-400">BIR 1601C</p>
                  <p className="mt-1 text-xl font-bold text-white">₱1,200</p>
                </div>
                <div className="rounded-xl border border-[#00FF88]/30 bg-[#00FF88]/[0.06] p-4">
                  <p className="text-xs text-slate-400">13th Month</p>
                  <p className="mt-1 text-xl font-bold text-[#00FF88]">₱12,500</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Paano gumagana */}
      <section id="paano" className="border-t border-white/10 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-sm font-bold uppercase tracking-wide text-slate-500">Paano gumagana</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-3">
            {HOW_IT_WORKS.map((s) => (
              <div key={s.step} className="rounded-2xl border border-white/10 bg-white/[0.02] p-6">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#00FF88] text-sm font-bold text-black">
                  {s.step}
                </span>
                <h3 className="mt-4 font-bold text-white">{s.title}</h3>
                <p className="mt-1.5 text-sm text-slate-400">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Customization Upsell */}
      <section className="border-t border-white/10 py-16 sm:py-20">
        <div className="mx-auto max-w-2xl px-4 text-center sm:px-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#052E1F] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#00FF88]">
            For Customization
          </span>
          <div className="mt-6 rounded-3xl border border-white/10 bg-white/[0.03] p-8 shadow-[0_0_60px_rgba(0,255,136,0.12)] backdrop-blur sm:p-10">
            <h2 className="text-2xl font-extrabold leading-tight text-white sm:text-3xl">
              Need Something More Advanced? Let&apos;s Customize
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-slate-400">
              Need payroll for 100+ staff? Multiple branches? Biometrics? Auto BIR Alphalist? We will build based on your exact business needs.
            </p>

            <div className="mt-6 flex items-center justify-center gap-2">
              <span className="text-sm text-slate-400">Starts at</span>
              <span className="text-3xl font-extrabold text-[#00FF88]">₱1,499</span>
            </div>
            <p className="mt-1 text-sm text-slate-500">Negotiable based on requirements</p>

            <a
              href="https://m.me/RSCryptoFX"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-8 inline-block w-full rounded-full bg-[#00FF88] px-7 py-3.5 text-center text-base font-semibold text-black shadow-lg shadow-[#00FF88]/25 transition hover:bg-[#22C55E] sm:w-auto"
            >
              Chat on Messenger
            </a>
            <p className="mt-3 text-xs text-slate-500">Reply within 2 hours • Let&apos;s talk</p>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <PayrollPricing autoPlan={autoPlan} />

      <Footer />
    </main>
  );
}
