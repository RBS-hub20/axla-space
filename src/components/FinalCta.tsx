import { Reveal } from "@/components/Reveal";

/**
 * Closing CTA before the footer — replaces the old waitlist email-capture
 * form (WaitlistSection/WaitlistForm) now that signups are free and open at
 * /signup. Mirrors the Hero's headline/CTA copy for consistency.
 */
export function FinalCta() {
  return (
    <section className="relative overflow-hidden bg-[#080F14] py-16 sm:py-20">
      <div className="pointer-events-none absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full bg-[#00FF88]/10 blur-[100px]" />
      <div className="relative mx-auto max-w-lg px-4 text-center sm:px-6">
        <Reveal>
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            <span className="bg-gradient-to-r from-[#00FF88] to-[#22C55E] bg-clip-text text-transparent">Tax Laya</span> Starts Here.
          </h2>
          <p className="mt-3 text-slate-400">Free to start — file BIR in 10 seconds, not 10 hours. No credit card required.</p>
        </Reveal>
        <Reveal delayMs={100}>
          <a
            href="/signup"
            className="mt-8 inline-block w-full rounded-full bg-[#00FF88] px-7 py-3.5 text-center text-base font-semibold text-[#080F14] shadow-lg shadow-[#00FF88]/25 transition hover:bg-[#22C55E] sm:w-auto"
          >
            Start Filing Free →
          </a>
        </Reveal>
      </div>
    </section>
  );
}
