import { CheckCircle2, FileText, Sparkles, Wallet } from "lucide-react";

/**
 * Hand-built representative mockup of the Axla dashboard — not a real
 * screenshot (none exists to embed), styled to read as a genuine product
 * preview: a filing list, a GCash upload success state, and a TaxLaya AI
 * chat exchange, layered into a floating "glass" card like Linear's hero.
 */
export function DashboardMockup() {
  return (
    <div className="relative w-full max-w-md">
      {/* Back card, peeking out for depth */}
      <div className="absolute -right-4 -top-4 h-full w-full rotate-3 rounded-2xl border border-white/10 bg-white/[0.03]" />

      <div className="relative -rotate-1 rounded-2xl border border-white/10 bg-[#0D141B] p-5 shadow-[0_30px_80px_-20px_rgba(0,255,136,0.25)]">
        {/* fake window chrome */}
        <div className="mb-4 flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#00FF88]/60" />
        </div>

        {/* Filing list */}
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-400">
            <FileText className="h-3.5 w-3.5" />
            BIR Forms
          </p>
          <div className="space-y-2">
            <div className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2">
              <span className="text-sm font-medium text-slate-200">2551Q — Q2 2026</span>
              <span className="rounded-full bg-[#00FF88]/15 px-2 py-0.5 text-[10px] font-semibold text-[#00FF88]">
                Filed
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg bg-white/[0.04] px-3 py-2">
              <span className="text-sm font-medium text-slate-200">1701Q — Q2 2026</span>
              <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                Draft
              </span>
            </div>
          </div>
        </div>

        {/* GCash upload success */}
        <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-[#00FF88]/20 bg-[#00FF88]/[0.06] px-3 py-2.5">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-[#00FF88]" />
          <div>
            <p className="text-xs font-semibold text-white">GCash history uploaded</p>
            <p className="text-[11px] text-slate-400">142 transactions synced</p>
          </div>
          <Wallet className="ml-auto h-4 w-4 text-slate-500" />
        </div>

        {/* TaxLaya chat preview */}
        <div className="mt-3 rounded-xl border border-white/5 bg-white/[0.03] p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-400">
            <Sparkles className="h-3.5 w-3.5 text-[#00FF88]" />
            TaxLaya
          </p>
          <p className="rounded-lg rounded-tr-sm bg-white/[0.06] px-3 py-2 text-[11px] text-slate-300">
            Boss ano ilalagay sa Line 12? 😩
          </p>
          <p className="mt-2 ml-auto w-fit rounded-lg rounded-tl-sm bg-[#00FF88]/15 px-3 py-2 text-[11px] text-[#00FF88]">
            Dito mo ilagay ang gross sales mo — kinuha ko na sa GCash history mo 🔥
          </p>
        </div>
      </div>
    </div>
  );
}
