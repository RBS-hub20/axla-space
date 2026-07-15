import { WaitlistForm } from "./WaitlistForm";

export function WaitlistSection() {
  return (
    <section id="waitlist" className="bg-slate-50 py-16 sm:py-20">
      <div className="mx-auto max-w-lg px-4 sm:px-6">
        <div className="text-center">
          <h2 className="text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">
            Join the waitlist
          </h2>
          <p className="mt-3 text-slate-600">
            Unang 100 users, libre ng 3 months. Priority access pag nag-launch.
          </p>
        </div>
        <div className="mt-8 rounded-2xl bg-white p-6 shadow-xl shadow-slate-200/50 ring-1 ring-slate-100 sm:p-8">
          <WaitlistForm />
        </div>
      </div>
    </section>
  );
}
