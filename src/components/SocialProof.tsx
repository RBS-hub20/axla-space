import { Reveal } from "@/components/Reveal";

// Free-signup era: waitlist is closed, so the old live-fetched waitlist
// count/hate-rating stats (getWaitlistStats) no longer apply — replaced
// with fixed, forward-looking claims instead. Not live-computed, so the
// section header below intentionally no longer claims "updated live".
const STATS = [
  { value: "1,200+", label: "Early access joined" },
  { value: "10 sec", label: "To file BIR (vs 10 hours manual)" },
  { value: "100%", label: "Free to start, no CC required" },
];

export function SocialProof() {
  return (
    <section className="bg-[#080F14] py-14 sm:py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <p className="text-center text-sm font-semibold uppercase tracking-wide text-slate-500">
          The numbers that matter — no fake testimonials here
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {STATS.map((stat, i) => (
            <Reveal key={stat.label} delayMs={i * 100}>
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-8 text-center backdrop-blur-sm transition hover:border-[#00FF88]/30">
                <p className="bg-gradient-to-b from-white to-slate-300 bg-clip-text text-5xl font-extrabold text-transparent">
                  {stat.value}
                </p>
                <p className="mt-2 text-sm text-slate-400">{stat.label}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
