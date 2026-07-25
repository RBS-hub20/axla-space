import { Wallet, CreditCard, Landmark, Receipt, FileCheck2, FileSpreadsheet, FileArchive } from "lucide-react";
import { Reveal } from "@/components/Reveal";

type Badge = "LIVE" | "SOON";

const integrations: {
  icon: typeof Wallet;
  title: string;
  description: string;
  badge: Badge;
}[] = [
  {
    icon: Wallet,
    title: "GCash",
    description: "Auto-parse transaction history CSV — income vs transfer detection",
    badge: "LIVE",
  },
  {
    icon: CreditCard,
    title: "Maya",
    description: "Auto-parse Maya wallet & business transactions",
    badge: "LIVE",
  },
  {
    icon: Landmark,
    title: "BPI / BDO / UnionBank",
    description: "Bank CSV & XLSX export parsing — no reformatting",
    badge: "LIVE",
  },
  {
    icon: Receipt,
    title: "Receipts & Invoices",
    description: "PDF, screenshots, OR scanning — EIS-ready",
    badge: "SOON",
  },
  {
    icon: FileCheck2,
    title: "BIR eBIRForms",
    description: "2551Q, 1701Q, 1701, 0619E, 2307 XML/DAT reference files",
    badge: "LIVE",
  },
  {
    icon: FileCheck2,
    title: "BIR eFPS / eAFS",
    description: "2550M VAT, SLSP, SAWT CSV — BIR compliant",
    badge: "SOON",
  },
  {
    icon: FileSpreadsheet,
    title: "QuickBooks / Xero / Sheets",
    description: "Excel-compatible export for accountants & bookkeepers",
    badge: "LIVE",
  },
  {
    icon: FileArchive,
    title: "PDF & RDO Packet",
    description: "BIR Form Preview PDF + Complete RDO Packet ZIP",
    badge: "LIVE",
  },
];

function IntegrationBadge({ badge }: { badge: Badge }) {
  if (badge === "LIVE") {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-[#052E1F] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#00FF88]">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00FF88]" />
        Live
      </span>
    );
  }
  return (
    <span className="rounded-full bg-white/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-slate-400">
      Soon
    </span>
  );
}

export function IntegrationsGrid() {
  return (
    <section className="bg-[#080F14] py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-[#00FF88]/30 bg-[#00FF88]/5 px-3 py-1 text-xs font-bold uppercase tracking-widest text-[#00FF88]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#00FF88]" />
            Integrations
          </span>
          <h2 className="mt-4 text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            From GCash to BIR. No middleware. No re-typing.
          </h2>
          <p className="mt-3 text-lg text-slate-400">
            Upload once, Axla handles the rest — auto-parse, auto-calculate, auto-export
          </p>
        </Reveal>

        <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {integrations.map((item, i) => (
            <Reveal key={item.title} delayMs={i * 60}>
              <div className="rounded-xl border border-[#1E293B] bg-[#141A2A] p-5 transition hover:border-[#00FF88]/50">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#00FF88]/10">
                    <item.icon className="h-4 w-4 text-[#00FF88]" />
                  </div>
                  <IntegrationBadge badge={item.badge} />
                </div>
                <h3 className="mt-3 text-base font-bold text-white">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-[#94A3B8]">{item.description}</p>
              </div>
            </Reveal>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-slate-400">
          142 transactions synced — No Zapier, no middleware, no manual encoding
        </p>
      </div>
    </section>
  );
}
