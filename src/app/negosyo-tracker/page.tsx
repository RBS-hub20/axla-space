import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { HowItWorksVideoButton } from "@/components/negosyo/HowItWorksVideoButton";

export const metadata = {
  title: "Negosyo Tracker — Sales, Tubo & Inventory Agent | Axla",
  description:
    "Hindi mo na kailangan mag type ng formula. 16 na kategorya, kasama ang Sari-Sari, Airbnb, Barbershop, Car Wash, Pandesal at Rental — auto-compute sales, tubo, at inventory tracker — ₱149 lang.",
};

const HOW_IT_WORKS = [
  { step: "1", title: "Fill-up", desc: "2 minutes lang — business name, kategorya, at mga paninda mo." },
  { step: "2", title: "Preview", desc: "Makikita agad ang buong tracker mo bago magbayad." },
  { step: "3", title: "Bayad ₱149", desc: "QR o checkout — pagkatapos, awtomatikong ma-download." },
];

const SHEETS = [
  { name: "Dashboard", desc: "Today at a glance + last 7 days — sales, tubo, alerts." },
  { name: "Inventory", desc: "Auto-compute ang tubo at margin — may restock alerts." },
  { name: "Daily Sales", desc: "Pumili ng produkto, awtomatikong makukuha ang total." },
  { name: "Expenses", desc: "I-log ang mga gastos — auto total kada buwan." },
  { name: "Utang Tracker", desc: "Sino may utang, magkano, bayad na ba." },
  { name: "Monthly & Yearly Report", desc: "Buwan-buwan at taon-taon na summary." },
];

export default function NegosyoTrackerPage() {
  return (
    <main className="bg-[#0B0F1A] text-white">
      <Navbar />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[32rem] w-[32rem] rounded-full bg-[#00FF88]/20 blur-[100px]" />
        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:gap-8 lg:py-28">
          <div className="text-center lg:text-left">
            <span className="inline-flex items-center gap-2 rounded-full bg-[#052E1F] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#00FF88]">
              Live Now
            </span>
            <h1 className="mt-6 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl">Negosyo Tracker</h1>
            <p className="mt-3 text-xl font-semibold text-[#00FF88] sm:text-2xl">Sales, Tubo &amp; Inventory Agent</p>
            <p className="mx-auto mt-4 max-w-xl text-lg text-slate-400 lg:mx-0">
              Hindi mo na kailangan mag type ng formula. 16 na kategorya ng negosyo!
            </p>

            <div className="mx-auto mt-6 flex max-w-md flex-wrap justify-center gap-4 text-xs font-medium text-slate-300 lg:mx-0 lg:justify-start">
              <span className="flex items-center gap-1.5">
                <span className="text-[#00FF88]">✓</span> No Formula
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[#00FF88]">✓</span> 16 Kategorya
              </span>
              <span className="flex items-center gap-1.5">
                <span className="text-[#00FF88]">✓</span> Download Agad
              </span>
            </div>

            <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
              <Link
                href="/negosyo-tracker/create"
                className="w-full rounded-full bg-[#00FF88] px-7 py-3.5 text-center text-base font-semibold text-black shadow-lg shadow-[#00FF88]/25 transition hover:bg-[#22C55E] sm:w-auto"
              >
                Gumawa ng Tracker — Libre mag browse
              </Link>
              <HowItWorksVideoButton />
            </div>
          </div>

          {/* Mockup */}
          <div className="hidden lg:block">
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#11172A] shadow-2xl">
              <div className="flex items-center justify-between bg-[#00FF88] px-5 py-3">
                <span className="text-sm font-bold text-black">Aling Nena Sari-Sari Store</span>
                <span className="text-xs font-semibold text-black/70">Dashboard</span>
              </div>
              <div className="grid grid-cols-2 gap-3 p-5">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs text-slate-400">Benta</p>
                  <p className="mt-1 text-xl font-bold text-white">₱12,450</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs text-slate-400">Tubo</p>
                  <p className="mt-1 text-xl font-bold text-[#00FF88]">₱4,200</p>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="text-xs text-slate-400">Gastos</p>
                  <p className="mt-1 text-xl font-bold text-white">₱2,100</p>
                </div>
                <div className="rounded-xl border border-amber-400/30 bg-amber-400/[0.06] p-4">
                  <p className="text-xs text-slate-400">Stock</p>
                  <p className="mt-1 text-xl font-bold text-amber-400">3 paubos</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Video demo */}
      <section className="border-y border-white/5 bg-[#0a0a0a] py-16">
        <div className="mx-auto max-w-5xl px-6 text-center">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-green-500/20 bg-green-500/10 px-4 py-1.5">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
            <span className="text-sm font-medium text-green-400">WATCH 90-SEC DEMO</span>
          </div>
          <h2 className="mb-3 text-3xl font-bold text-white md:text-4xl">Mula Business Name Hanggang Tubo - 90 Seconds Lang</h2>
          <p className="mb-8 text-white/60">Hindi mo na kailangan mag-type ng formula. Panoorin mo.</p>

          <div className="relative overflow-hidden rounded-2xl border border-green-500/20 bg-black shadow-[0_0_50px_rgba(34,197,94,0.15)]">
            <div className="aspect-video">
              <iframe
                src="https://www.youtube.com/embed/V5hq4WBRpto?rel=0&modestbranding=1"
                className="h-full w-full"
                title="Negosyo Tracker demo"
                allow="autoplay; encrypted-media"
                allowFullScreen
              />
            </div>
          </div>

          <div className="mx-auto mt-8 grid max-w-2xl grid-cols-3 gap-4">
            <div className="text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">1️⃣</div>
              <p className="text-sm font-medium text-white">Pili Negosyo</p>
              <p className="text-xs text-white/50">16 categories</p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">2️⃣</div>
              <p className="text-sm font-medium text-white">Lagay Details</p>
              <p className="text-xs text-white/50">Business name + paninda</p>
            </div>
            <div className="text-center">
              <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-green-500/10">3️⃣</div>
              <p className="text-sm font-medium text-white">Download Agad</p>
              <p className="text-xs text-white/50">Excel + Dashboard</p>
            </div>
          </div>

          <Link
            href="/negosyo-tracker/create"
            className="mt-8 inline-block rounded-full bg-[#22c55e] px-8 py-4 text-lg font-bold text-black transition hover:bg-[#16a34a]"
          >
            Gumawa ng Tracker Ko — Libre mag browse →
          </Link>
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

      {/* Ano laman */}
      <section className="border-t border-white/10 py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-sm font-bold uppercase tracking-wide text-slate-500">Ano laman — Depende sa Kategorya</h2>
          <p className="mx-auto mt-2 max-w-lg text-center text-sm text-slate-400">
            10 sheets para sa Sari-Sari, Online Seller, at katulad — mas marami pa para sa Airbnb, Barbershop, Car Wash, Pandesal at Rental.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {SHEETS.map((sheet) => (
              <div key={sheet.name} className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
                <h3 className="font-bold text-[#00FF88]">{sheet.name}</h3>
                <p className="mt-1.5 text-sm text-slate-400">{sheet.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="border-t border-white/10 py-16 sm:py-20">
        <div className="mx-auto max-w-md px-4 sm:px-6">
          <div className="rounded-2xl border-2 border-[#00FF88] bg-white/[0.03] p-8 text-center shadow-xl shadow-[#00FF88]/10">
            <span className="inline-flex rounded-full bg-[#052E1F] px-3 py-1 text-xs font-bold uppercase tracking-wide text-[#00FF88]">
              Launch Promo
            </span>
            <div className="mt-4 flex items-center justify-center gap-2">
              <span className="text-lg text-slate-500 line-through">₱299</span>
              <span className="text-5xl font-extrabold text-white">₱149</span>
            </div>
            <p className="mt-1 text-sm text-slate-400">One-time lang, hindi subscription</p>

            <ul className="mt-6 space-y-2.5 text-left text-sm text-slate-300">
              {[
                "One-time payment — hindi paulit-ulit",
                "16 na kategorya — Sari-Sari hanggang Airbnb",
                "Naka-lock ang mga formula — hindi masisira",
                "Tagalog — madaling gamitin",
                "Lifetime — sayo na ang file",
              ].map((line) => (
                <li key={line} className="flex items-start gap-2">
                  <span className="mt-0.5 text-[#00FF88]">✓</span>
                  {line}
                </li>
              ))}
            </ul>

            <Link
              href="/negosyo-tracker/create"
              className="mt-8 block w-full rounded-full bg-[#00FF88] px-6 py-3.5 text-center text-base font-semibold text-black shadow-lg shadow-[#00FF88]/25 transition hover:bg-[#22C55E]"
            >
              Simulan
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
