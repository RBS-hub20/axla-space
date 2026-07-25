/** Small pulsing "NEW" pill for flagging recently-shipped features inline (nav items, upload page, BIR form tabs) — visually distinct from the sidebar's static text badges since this one pulses. */
export function FeatureBadge({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full bg-[#00FF85]/15 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#00FF85] ${className}`}
    >
      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#00FF85]" />
      New
    </span>
  );
}
