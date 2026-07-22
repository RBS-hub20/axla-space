"use client";

import { useRouter, usePathname } from "next/navigation";
import { Building2 } from "lucide-react";

interface SwitcherBusiness {
  id: string;
  name: string;
  isPrimary: boolean;
}

interface BusinessSwitcherProps {
  businesses: SwitcherBusiness[];
  selectedId: string | "all" | null;
}

/** Overview's business filter — updates the `?business=` query param, which the server component re-reads on navigation. */
export function BusinessSwitcher({ businesses, selectedId }: BusinessSwitcherProps) {
  const router = useRouter();
  const pathname = usePathname();

  function handleChange(value: string) {
    router.push(`${pathname}?business=${value}`);
  }

  return (
    <div className="flex items-center gap-2">
      <Building2 className="h-4 w-4 text-slate-500" />
      <select
        value={selectedId ?? "all"}
        onChange={(e) => handleChange(e.target.value)}
        className="h-9 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
      >
        {businesses.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
            {b.isPrimary ? " (Primary)" : ""}
          </option>
        ))}
        <option value="all">All Businesses (consolidated)</option>
      </select>
    </div>
  );
}
