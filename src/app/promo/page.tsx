import Link from "next/link";
import { TaxLayaPromoVideo } from "@/components/promo/TaxLayaPromoVideo";

// Internal tool for pulling an FB Ads mockup, not a marketing page — kept
// out of the sitemap (which is an explicit allowlist, see sitemap.ts) and
// out of search results.
export const metadata = {
  title: "TaxLaya Promo Video — Axla",
  robots: { index: false, follow: false },
};

export default function PromoPage() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-[#0B0F1A] px-4 py-8 text-white">
      <div className="mb-6 flex w-full max-w-sm items-center justify-between">
        <Link href="/" className="text-xs font-medium text-slate-500 transition hover:text-slate-300">
          ← Back to axla.space
        </Link>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">TaxLaya Promo — 30s</span>
      </div>

      <TaxLayaPromoVideo />

      <p className="mt-6 max-w-sm text-center text-[11px] text-slate-500">
        Internal mockup for FB/IG Ads — not a real video file. Use the &ldquo;Record 30s&rdquo; button for screen-recording
        instructions to export an MP4.
      </p>
    </main>
  );
}
