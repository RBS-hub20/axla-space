import { WaitlistForm } from "./WaitlistForm";
import { Reveal } from "@/components/Reveal";

export function WaitlistSection() {
  return (
    <section id="waitlist" className="relative overflow-hidden bg-[#080F14] py-16 sm:py-20">
      <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-[#00FF88]/10 blur-[100px]" />
      <div className="relative mx-auto max-w-lg px-4 sm:px-6">
        <Reveal className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            Join the waitlist
          </h2>
          <p className="mt-3 text-slate-400">
            Unang 100 users, libre ng 3 months. Priority access pag nag-launch.
          </p>
        </Reveal>
        <Reveal delayMs={100}>
          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-2xl shadow-black/40 backdrop-blur-sm sm:p-8">
            <WaitlistForm />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
