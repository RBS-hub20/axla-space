import { getWaitlistStats } from "@/lib/waitlist-stats";

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
    <section className="bg-white py-14 sm:py-16">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <p className="text-center text-sm font-semibold uppercase tracking-wide text-slate-400">
          Real numbers, updated live — no fake testimonials here
        </p>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-slate-100 bg-slate-50 p-6 text-center"
            >
              <p className="text-3xl font-extrabold text-navy">{stat.value}</p>
              <p className="mt-1 text-sm text-slate-600">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
