import { Reveal } from "@/components/Reveal";

const points = [
  {
    title: "Built for PH freelancers, not US startups",
    description:
      "Axla knows 2551Q, 1701Q, 8% flat rate, RDO codes — di generic accounting software na US-focused.",
  },
  {
    title: "Bank-level security. We never store your docs.",
    description:
      "Encrypted end-to-end. Your GCash history and receipts are processed, then deleted — hindi namin ni-retain.",
  },
  {
    title: "24/7 agent chat",
    description:
      '"Boss ano ilalagay sa Line 12?" — tanong mo lang, sasagutin ka ni Axla anytime, kahit 2AM bago deadline.',
  },
];

export function WhyAxla() {
  return (
    <section className="bg-[#080F14] py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <Reveal className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">Why Axla</h2>
        </Reveal>
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {points.map((point, i) => (
            <Reveal key={point.title} delayMs={i * 120}>
              <div className="group rounded-2xl border border-white/10 bg-white/[0.03] p-6 transition duration-300 hover:-translate-y-1 hover:border-[#00FF88]/30 hover:shadow-[0_20px_60px_-15px_rgba(0,255,136,0.25)]">
                <span className="mb-4 block h-2 w-2 rounded-full bg-[#00FF88] shadow-[0_0_12px_2px_rgba(0,255,136,0.5)]" />
                <h3 className="text-lg font-bold text-white">{point.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-400">{point.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
