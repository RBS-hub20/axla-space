import Link from "next/link";

export const metadata = { title: "Terms of Service — Axla" };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <Link href="/" className="text-sm font-semibold text-accent-dark">
        ← Back to Axla
      </Link>
      <h1 className="mt-6 text-3xl font-extrabold text-navy">Terms of Service</h1>
      <p className="mt-4 text-slate-600">
        Axla is in early access. This placeholder will be replaced with our
        full terms of service before public launch. Axla assists with tax
        computation and form preparation; you remain responsible for
        reviewing and filing accurate returns with the BIR.
      </p>
      <p className="mt-4 text-slate-600">
        Questions? Email us at{" "}
        <a href="mailto:hello@axla.space" className="text-accent-dark underline">
          hello@axla.space
        </a>
        .
      </p>
    </main>
  );
}
