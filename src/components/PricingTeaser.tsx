export function PricingTeaser() {
  return (
    <section className="bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2 className="text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">
          Simple pricing
        </h2>
        <p className="mt-4 text-xl font-semibold text-navy">
          Starts at <span className="text-accent">₱299</span>/quarter
        </p>
        <p className="mt-2 text-slate-600">
          First 100 users free forever. Wala nang hidden fees.
        </p>
        <a
          href="#waitlist"
          className="mt-8 inline-block rounded-full bg-navy px-7 py-3.5 text-base font-semibold text-white transition hover:bg-navy-light"
        >
          Claim your free spot
        </a>
      </div>
    </section>
  );
}
