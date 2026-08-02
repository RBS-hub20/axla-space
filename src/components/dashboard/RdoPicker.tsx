"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { RDO_LIST, type RdoOption } from "@/lib/dashboard/rdo-list";

/** Value is always the formatted "044 - Taguig-Pateros" string — parseRdoValue() splits it back into {code, name} for callers that need to persist them separately. */
export function parseRdoValue(value: string): RdoOption | null {
  const match = value.match(/^(\S+)\s-\s(.+)$/);
  if (!match) return null;
  return { code: match[1], name: match[2] };
}

export function formatRdoValue(rdo: RdoOption): string {
  return `${rdo.code} - ${rdo.name}`;
}

/**
 * Searchable RDO dropdown — filters the shared RDO_LIST (src/lib/dashboard/rdo-list.ts)
 * by code or city as you type. Originally built for the Settings page's RDO
 * fields; reused as-is by BIR Guard's RDO Transfer tab.
 */
export function RdoPicker({
  value,
  onChange,
  placeholder = "Select RDO",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = useMemo(() => RDO_LIST.find((r) => formatRdoValue(r) === value), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return RDO_LIST;
    return RDO_LIST.filter((r) => r.code.toLowerCase().includes(q) || r.name.toLowerCase().includes(q));
  }, [query]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((v) => !v)}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-slate-700 bg-slate-900 px-3 text-left text-sm text-slate-100 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span className={selected ? "text-slate-100" : "text-slate-500"}>
          {selected ? `RDO ${selected.code} - ${selected.name}` : placeholder}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-slate-500" />
      </button>

      {isOpen && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-900 shadow-xl">
          <div className="border-b border-slate-800 p-2">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search RDO code or city..."
              className="h-9 w-full rounded-md border border-slate-700 bg-slate-950 px-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-sm text-slate-500">No matches.</p>
            ) : (
              filtered.map((rdo) => (
                <button
                  key={rdo.code}
                  type="button"
                  onClick={() => {
                    onChange(formatRdoValue(rdo));
                    setIsOpen(false);
                    setQuery("");
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800"
                >
                  <span>
                    <span className="font-medium text-[#00FF85]">RDO {rdo.code}</span> — {rdo.name}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
