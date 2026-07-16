import Link from "next/link";

export const metadata = { title: "Terms of Service — Axla" };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
      <Link href="/" className="text-sm font-semibold text-accent-dark">
        ← Back to Axla
      </Link>
      <h1 className="mt-6 text-3xl font-extrabold text-navy">Terms of Service</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: July 2026</p>

      <p className="mt-6 text-slate-600">
        By using axla.space or TaxLaya, you agree to these terms. Please
        read them — they cover what Axla is (and isn't) responsible for.
      </p>

      <h2 className="mt-8 text-lg font-bold text-navy">Not a CPA, not tax advice</h2>
      <p className="mt-3 text-slate-600">
        TaxLaya is an AI assistant, not a Certified Public Accountant, tax
        lawyer, or BIR representative. Its answers are informational and
        based on general knowledge of BIR forms, deadlines, and processes —
        they are <strong>not</strong> personalized professional tax advice.
        TaxLaya can be wrong, out of date, or miss something specific to
        your situation.
      </p>

      <h2 className="mt-8 text-lg font-bold text-navy">Your responsibility</h2>
      <p className="mt-3 text-slate-600">
        You are solely responsible for the accuracy of any tax return,
        form, or filing you submit to the BIR, and for verifying anything
        TaxLaya tells you against official BIR sources or a licensed
        accountant before relying on it. Axla is not liable for penalties,
        surcharges, interest, or other consequences arising from your use of
        (or reliance on) TaxLaya's responses.
      </p>

      <h2 className="mt-8 text-lg font-bold text-navy">Usage limits</h2>
      <p className="mt-3 text-slate-600">
        To keep TaxLaya free and available to everyone, we currently limit
        each user to 10 messages per day (tracked by IP address). We may
        change this limit, introduce paid tiers with higher limits, or
        adjust availability at any time.
      </p>

      <h2 className="mt-8 text-lg font-bold text-navy">Acceptable use</h2>
      <p className="mt-3 text-slate-600">
        Don't use TaxLaya to abuse, spam, or attempt to circumvent rate
        limits, or for anything unlawful. We may block access (including by
        IP address) for accounts or traffic that abuse the service.
      </p>

      <h2 className="mt-8 text-lg font-bold text-navy">Service "as is"</h2>
      <p className="mt-3 text-slate-600">
        Axla is under active, pre-launch development. The service is
        provided "as is" and "as available," without warranties of any
        kind, and may change, break, or go down without notice. We aren't
        liable for any damages arising from your use of the service, to the
        maximum extent permitted by law.
      </p>

      <h2 className="mt-8 text-lg font-bold text-navy">Governing law</h2>
      <p className="mt-3 text-slate-600">
        These terms are governed by the laws of the Republic of the
        Philippines.
      </p>

      <p className="mt-8 text-sm text-slate-500">
        Axla is a pre-launch product. These terms will be expanded (and
        reviewed by counsel) as we approach a full public launch.
      </p>

      <p className="mt-6 text-slate-600">
        Questions? Email us at{" "}
        <a href="mailto:hello@axla.space" className="text-accent-dark underline">
          hello@axla.space
        </a>
        .
      </p>
    </main>
  );
}
