import { getWaitlistStats } from "@/lib/waitlist-stats";
import { Reveal } from "@/components/Reveal";

export async function SocialProof() {
  const { count, avgHateLevel } = await getWaitlistStats();

  const stats = [
    {
      value: count > 0 ? `${count.toLocaleString()}+` : "Growing",
      label: "Filipinos on the waitlist",
    },
    {
      value: avgHateLevel > 0 ? `${avgHateLevel.toFixed(1)}/10` : "—",
      label: "Average BIR hassle rating",
    },
    { value: "24/7", label: "Free TaxLaya access, no login" },
  ];

  return (
    <section className="bg-[#080F14] py-14 sm:py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <p className="text-center text-sm font-semibold uppercase tracking-wide text-slate-500">
          Real numbers, updated live — no fake testimonials here
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {stats.map((stat, i) => (
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
