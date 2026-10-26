import Link from "next/link";
import { AxlaShowreelStudio } from "@/components/promo/AxlaShowreelStudio";

// Internal ad-production tool, not a marketing page — kept out of the
// sitemap (an explicit allowlist, see sitemap.ts) and out of search results.
export const metadata = {
  title: "TaxLaya Showreel Studio — Axla",
  robots: { index: false, follow: false },
};

export default function PromoVideoPage() {
  return (
    <main className="flex min-h-screen flex-col items-center bg-[#0B0F1A] px-4 py-8 text-white">
      <div className="mb-6 flex w-full max-w-[960px] items-center justify-between">
        <Link href="/" className="text-xs font-medium text-slate-500 transition hover:text-slate-300">
          ← Back to axla.space
        </Link>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">TaxLaya Showreel — 1920×1080</span>
      </div>

      <AxlaShowreelStudio />
    </main>
  );
}
