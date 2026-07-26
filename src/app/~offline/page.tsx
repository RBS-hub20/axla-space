import Image from "next/image";

/**
 * Service-worker offline fallback — @ducanh2912/next-pwa serves this
 * document when a navigation fails with no network (see next.config.mjs's
 * fallbacks.document). Lives at the App Router-safe "~offline" path since
 * a literal "_offline" folder would be treated as private and excluded
 * from routing entirely.
 */
export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#0B0F1A] px-6 text-center">
      <Image src="/axla-app-icon.png" alt="Axla" width={72} height={72} className="rounded-2xl" priority />
      <h1 className="text-xl font-bold text-white">You&apos;re offline</h1>
      <p className="max-w-xs text-sm text-slate-400">
        Check your internet connection — BIR filing needs a live connection to Axla&apos;s servers.
      </p>
    </div>
  );
}
