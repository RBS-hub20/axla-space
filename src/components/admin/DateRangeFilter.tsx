"use client";

import { cn } from "@/lib/utils";

export type DateRange = "7d" | "30d" | "all";

const OPTIONS: { value: DateRange; label: string }[] = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
];

export function DateRangeFilter({
  value,
  onChange,
}: {
  value: DateRange;
  onChange: (range: DateRange) => void;
}) {
  return (
    <div className="flex gap-1 rounded-lg bg-gray-800 p-1">
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-medium transition",
            value === option.value
              ? "bg-taxlaya-green text-gray-950"
              : "text-gray-400 hover:text-gray-200",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
