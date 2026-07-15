const steps = [
  {
    number: "01",
    title: "Connect GCash or upload receipts",
    description:
      "I-link ang GCash mo or mag-upload ng receipts/screenshots. Axla reads your transaction history automatically.",
  },
  {
    number: "02",
    title: "Axla calculates + fills BIR forms",
    description:
      "Axla computes your quarterly tax due and auto-fills your 2551Q + 1701Q. No manual encoding.",
  },
  {
    number: "03",
    title: "You review, print, or we guide you to file",
    description:
      "Check mo lang, i-print, or susunduin ka namin step-by-step papuntang eFPS/eBIRForms filing.",
  },
];

export function HowItWorks() {
  return (
    <section className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">
            How it works
          </h2>
          <p className="mt-3 text-lg text-slate-600">Three steps. Wala nang gulo.</p>
        </div>
        <div className="mt-12 grid gap-8 sm:grid-cols-3">
          {steps.map((step) => (
            <div key={step.number} className="relative rounded-2xl border border-slate-100 bg-slate-50 p-6">
              <span className="text-4xl font-extrabold text-accent/30">{step.number}</span>
              <h3 className="mt-3 text-lg font-bold text-navy">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
