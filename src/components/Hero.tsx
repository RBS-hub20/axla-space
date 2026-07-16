import Image from "next/image";
import { getWaitlistStats } from "@/lib/waitlist-stats";

export async function Hero() {
  const { count } = await getWaitlistStats();

  return (
    <section id="top" className="relative overflow-hidden bg-navy text-white">
      <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
      <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-2 lg:gap-8 lg:py-28">
        <div className="animate-fade-up text-center lg:text-left">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-accent">
            First agent: RDO Runner (PH BIR taxes)
          </span>
          <h1 className="mt-5 text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl lg:text-6xl">
            Stop doing your BIR taxes.
            <br />
            Let <span className="text-accent">Axla</span> do it.
          </h1>
          <p className="mt-4 text-sm font-semibold text-accent">
            {count >= 10
              ? `Join ${count.toLocaleString()}+ Filipinos who hate BIR paperwork 🔥`
              : "Join the Filipinos who hate BIR paperwork 🔥"}
          </p>
          <p className="mx-auto mt-3 max-w-xl text-lg text-slate-300 lg:mx-0">
            Upload your GCash history. Axla files your 2551Q + 1701Q in
            minutes. No CPA, no pila, no stress.
          </p>
          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
            <a
              href="#waitlist"
              className="w-full rounded-full bg-accent px-7 py-3.5 text-center text-base font-semibold text-navy shadow-lg shadow-accent/25 transition hover:bg-accent-dark sm:w-auto"
            >
              Join waitlist — Get 3 months free
            </a>
          </div>
          <p className="mt-4 text-sm text-slate-400">
            Libreng 3 buwan para sa unang 100 users. Walang credit card kailangan.
          </p>
        </div>

        <div className="flex justify-center lg:justify-end">
          <div className="relative">
            <div className="absolute inset-0 -z-10 scale-90 rounded-[2.5rem] bg-accent/20 blur-2xl" />
            <Image
              src="/axla-app-icon.png"
              alt="Axla app icon"
              width={340}
              height={340}
              className="h-56 w-56 rounded-[2.5rem] shadow-2xl sm:h-72 sm:w-72 lg:h-80 lg:w-80"
              priority
            />
          </div>
        </div>
      </div>
    </section>
  );
}
