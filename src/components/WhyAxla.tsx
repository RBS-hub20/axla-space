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
    <section className="bg-navy py-16 text-white sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl">Why Axla</h2>
        </div>
        <div className="mt-12 grid gap-6 sm:grid-cols-3">
          {points.map((point) => (
            <div key={point.title} className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
              <div className="mb-4 h-10 w-10 rounded-full bg-accent/20" aria-hidden />
              <h3 className="text-lg font-bold">{point.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{point.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
