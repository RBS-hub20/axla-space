interface TaxHealthGaugeProps {
  score: number;
}

export function TaxHealthGauge({ score }: TaxHealthGaugeProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (clamped / 100) * circumference;
  const color = clamped >= 80 ? "#22c55e" : clamped >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <div className="relative flex h-28 w-28 shrink-0 items-center justify-center sm:h-32 sm:w-32">
      <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
        <circle cx="50" cy="50" r={radius} fill="none" stroke="#1E293B" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-extrabold text-white">{clamped}</span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-gray-500">Tax Health</span>
      </div>
    </div>
  );
}
