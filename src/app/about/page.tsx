import Image from "next/image";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";

export const metadata = {
  title: "About — Axla Software Development Services",
  description: "Axla Software Development Services builds AI agents for Filipino business admin — TaxLaya is our first, live now.",
};

const PRODUCTS = [
  { name: "TaxLaya", tagline: "BIR Tax Agent", status: "live" as const },
  { name: "Negosyo Tracker", tagline: "Sales, Tubo & Inventory Agent", status: "live" as const },
  { name: "Axla Payroll", tagline: "Pasahod, Payslip & DOLE Agent", status: "live" as const, href: "/payroll" },
  { name: "POS", tagline: "Point of sale agent", status: "soon" as const },
  { name: "CRM", tagline: "Customer relationships agent", status: "soon" as const },
  { name: "HR", tagline: "People operations agent", status: "soon" as const },
];

export default function AboutPage() {
  return (
    <main className="bg-[#080F14] text-white">
      <Navbar />

      <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6 sm:py-28">
        {/* Top: the company */}
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">The company behind Axla</p>
        <h1 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-5xl">AXLA SOFTWARE DEVELOPMENT SERVICES</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-400">
          We build AI agents that handle the admin work Filipino freelancers and small businesses hate doing —
          starting with BIR taxes.
        </p>

        {/* Middle: the technology brand — same official logo, untouched */}
        <div className="mt-16 flex flex-col items-center gap-3">
          <Image src="/axla-logo-dark.png" alt="Axla" width={180} height={50} className="h-12 w-auto" priority />
          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-wide text-slate-400">
            Technology Brand
          </span>
        </div>

        {/* Bottom: the product lineup — TaxLaya is a product under Axla, not a rebrand of it */}
        <div className="mt-20 text-left">
          <h2 className="text-center text-sm font-bold uppercase tracking-wide text-slate-500">Our Products</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {PRODUCTS.map((p) => {
              const cardClass = `block rounded-2xl border p-5 transition ${
                p.status === "live"
                  ? "border-[#22c55e]/40 bg-[#22c55e]/[0.06] shadow-lg shadow-green-500/10"
                  : "border-white/10 bg-white/[0.02]"
              } ${p.href ? "hover:border-[#22c55e]/70 hover:bg-[#22c55e]/[0.09]" : ""}`;
              const inner = (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-white">{p.name}</h3>
                    {p.status === "live" ? (
                      <span className="shrink-0 rounded-full bg-[#22c55e] px-2 py-0.5 text-[10px] font-bold uppercase text-[#080F14]">
                        Live Now
                      </span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-medium uppercase text-slate-400">
                        Coming Soon
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-sm text-slate-400">{p.tagline}</p>
                </>
              );
              return p.href ? (
                <Link key={p.name} href={p.href} className={cardClass}>
                  {inner}
                </Link>
              ) : (
                <div key={p.name} className={cardClass}>
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <Footer />
    </main>
  );
}
