import { Smartphone, Calculator, Send } from "lucide-react";
import { Reveal } from "@/components/Reveal";

const steps = [
  {
    number: "01",
    icon: Smartphone,
    title: "Connect GCash or upload receipts",
    description:
      "I-link ang GCash mo or mag-upload ng receipts/screenshots. Axla reads your transaction history automatically.",
    preview: "142 transactions synced",
  },
  {
    number: "02",
    icon: Calculator,
    title: "Axla calculates + fills BIR forms",
    description:
      "Axla computes your quarterly tax due and auto-fills your 2551Q + 1701Q. No manual encoding.",
    preview: "2551Q + 1701Q auto-filled",
  },
  {
    number: "03",
    icon: Send,
    title: "You review, print, or we guide you to file",
    description:
      "Check mo lang, i-print, or susunduin ka namin step-by-step papuntang eFPS/eBIRForms filing.",
    preview: "Ready to file — Q2 2026",
  },
];

export function HowItWorks() {
  return (
    <section className="bg-[#080F14] py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            How it works
          </h2>
          <p className="mt-3 text-lg text-slate-400">Three steps. Wala nang gulo.</p>
        </Reveal>

        <div className="relative mt-14 grid gap-8 sm:grid-cols-3">
          <div className="absolute left-0 right-0 top-6 hidden h-px bg-gradient-to-r from-transparent via-white/10 to-transparent sm:block" />

          {steps.map((step, i) => (
            <Reveal key={step.number} delayMs={i * 120}>
              <div className="relative rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition hover:border-[#00FF88]/30">
                <div className="flex items-center justify-between">
                  <span className="text-3xl font-extrabold text-[#00FF88]/25">{step.number}</span>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#00FF88]/10">
                    <step.icon className="h-4 w-4 text-[#00FF88]" />
                  </div>
                </div>
                <h3 className="mt-4 text-lg font-bold text-white">{step.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{step.description}</p>

                <div className="mt-4 flex items-center gap-2 rounded-lg border border-white/5 bg-black/20 px-3 py-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#00FF88]" />
                  <span className="text-xs font-medium text-slate-400">{step.preview}</span>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
