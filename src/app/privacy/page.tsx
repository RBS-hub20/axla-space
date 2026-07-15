import Link from "next/link";

export const metadata = { title: "Privacy Policy — Axla" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <Link href="/" className="text-sm font-semibold text-accent-dark">
        ← Back to Axla
      </Link>
      <h1 className="mt-6 text-3xl font-extrabold text-navy">Privacy Policy</h1>
      <p className="mt-4 text-slate-600">
        Axla is in early access. This placeholder will be replaced with our
        full privacy policy before public launch. In short: we don&apos;t
        store your uploaded documents or GCash history longer than needed to
        compute your tax filing, and we never sell your data.
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
