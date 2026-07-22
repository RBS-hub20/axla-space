const PESO = (n: number) => `₱${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

interface Bir2551QPaperPreviewProps {
  name: string;
  tin: string;
  quarter: number;
  year: number;
  gross: number;
  taxRate: number;
  taxDue: number;
  date: Date;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-dashed border-gray-300 py-2">
      <span className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</span>
      <span className="text-sm font-semibold text-gray-900">{value}</span>
    </div>
  );
}

/** Live client-side mirror of what generate2551QPDF() will produce — a paper-white "form" card, not the actual PDF. Updates on every keystroke via the props passed in from page state. */
export function Bir2551QPaperPreview({ name, tin, quarter, year, gross, taxRate, taxDue, date }: Bir2551QPaperPreviewProps) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-white p-6 text-gray-900 shadow-xl sm:p-8">
      <span className="pointer-events-none absolute inset-0 flex select-none items-center justify-center overflow-hidden">
        <span className="rotate-[-30deg] text-6xl font-black uppercase tracking-widest text-gray-900/[0.06] sm:text-7xl">
          Preview
        </span>
      </span>

      <div className="relative">
        <div className="border-b-2 border-gray-900 pb-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Bureau of Internal Revenue</p>
          <h3 className="text-lg font-bold text-gray-900 sm:text-xl">BIR Form 2551Q</h3>
          <p className="text-xs text-gray-500">Quarterly Percentage Tax Return</p>
        </div>

        <div className="mt-4">
          <Field label="Taxpayer Name" value={name || "Not set"} />
          <Field label="TIN" value={tin || "Not set"} />
          <Field label="Quarter" value={`Q${quarter} ${year}`} />
          <Field label="Gross Sales" value={PESO(gross)} />
          <Field label="Tax Rate" value={`${(taxRate * 100).toFixed(0)}%`} />
        </div>

        <div className="mt-4 flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
          <span className="text-sm font-bold uppercase text-gray-700">Tax Due</span>
          <span className="text-2xl font-extrabold text-[#15803d]">{PESO(taxDue)}</span>
        </div>

        <p className="mt-4 text-right text-xs text-gray-500">
          {date.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}
        </p>
      </div>
    </div>
  );
}
