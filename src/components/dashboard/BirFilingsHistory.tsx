import { Download, FileStack } from "lucide-react";

export interface BirFiling {
  id: string;
  quarter: number;
  year: number;
  gross: number;
  tax_due: number;
  status: string;
  finalized_at: string;
}

const PESO = (n: number) => `₱${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const CARD = "rounded-2xl border-[#1E293B] bg-[#121A22] shadow-sm transition hover:border-[#22c55e]/30 hover:shadow-lg hover:shadow-green-500/10";

interface BirFilingsHistoryProps {
  filings: BirFiling[];
  isLoading: boolean;
  onViewPdf: (filing: BirFiling) => void;
}

export function BirFilingsHistory({ filings, isLoading, onViewPdf }: BirFilingsHistoryProps) {
  if (isLoading) {
    return (
      <div className="grid gap-3">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className={`${CARD} p-5`}>
            <div className="h-4 w-40 animate-pulse rounded bg-white/5" />
            <div className="mt-3 h-3 w-56 animate-pulse rounded bg-white/5" />
          </div>
        ))}
      </div>
    );
  }

  if (filings.length === 0) {
    return (
      <div className={`${CARD} flex flex-col items-center gap-2 px-6 py-10 text-center`}>
        <FileStack className="h-8 w-8 text-gray-600" />
        <p className="text-sm text-slate-400">No finalized quarters yet.</p>
      </div>
    );
  }

  return (
    <div className="grid gap-3">
      {filings.map((filing) => (
        <div key={filing.id} className={`${CARD} flex flex-wrap items-center justify-between gap-3 p-4`}>
          <div>
            <p className="text-sm font-semibold text-white">
              Q{filing.quarter} {filing.year}
            </p>
            <p className="text-xs text-gray-500">
              Finalized {new Date(filing.finalized_at).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-gray-500">Gross</p>
              <p className="text-sm font-semibold text-white">{PESO(filing.gross)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-500">Tax Due</p>
              <p className="text-sm font-semibold text-[#22c55e]">{PESO(filing.tax_due)}</p>
            </div>
            <span className="rounded-full bg-[#22c55e]/10 px-2.5 py-1 text-xs font-semibold text-[#22c55e]">Finalized</span>
            <button
              type="button"
              onClick={() => onViewPdf(filing)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#1E293B] px-3 text-xs font-medium text-slate-200 hover:bg-white/5"
            >
              <Download className="h-3.5 w-3.5" />
              View PDF
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
