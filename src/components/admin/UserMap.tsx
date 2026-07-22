import { Globe2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WaitlistRow } from "@/lib/supabase/admin";

const CITY_KEYWORDS: Record<string, string[]> = {
  Manila: ["manila", "quezon city", "makati", "taguig", "pasig", "ncr", "metro manila"],
  Cebu: ["cebu"],
  Davao: ["davao"],
};

interface CityCount {
  city: string;
  count: number;
}

// Real path: only lights up once signups actually carry a city/location
// value (no such column exists on the live waitlist table yet — see the
// comment on WaitlistRow.city in src/lib/supabase/admin.ts). Until then this
// always returns null and callers fall back to the mock split below.
function realCityCounts(signups: WaitlistRow[]): CityCount[] | null {
  const values = signups.map((s) => (s.city || s.location || "").toLowerCase().trim()).filter(Boolean);
  if (values.length === 0) return null;

  const buckets: Record<string, number> = { Manila: 0, Cebu: 0, Davao: 0, "OFW/Abroad": 0 };
  let matched = 0;

  for (const value of values) {
    let placed = false;
    for (const [city, keywords] of Object.entries(CITY_KEYWORDS)) {
      if (keywords.some((k) => value.includes(k))) {
        buckets[city] += 1;
        matched += 1;
        placed = true;
        break;
      }
    }
    if (!placed && /abroad|ofw|overseas/.test(value)) {
      buckets["OFW/Abroad"] += 1;
      matched += 1;
    }
  }

  return matched === 0 ? null : Object.entries(buckets).map(([city, count]) => ({ city, count }));
}

// Flat 40/20/20/20 demo split, scaled against the real total signup count so
// at least the raw numbers are anchored to something real even though the
// city attribution itself is invented — always clearly labeled "Estimated"
// in the UI so it's never mistaken for verified data.
function mockCityCounts(total: number): CityCount[] {
  const split: [string, number][] = [
    ["Manila", 0.4],
    ["Cebu", 0.2],
    ["Davao", 0.2],
    ["OFW/Abroad", 0.2],
  ];
  const entries = split.map(([city, pct]) => ({ city, count: Math.round(total * pct) }));
  const drift = total - entries.reduce((sum, e) => sum + e.count, 0);
  entries[0].count += drift; // Manila absorbs rounding drift so the bars sum to `total` exactly.
  return entries;
}

interface UserMapProps {
  signups: WaitlistRow[];
  className?: string;
}

export function UserMap({ signups, className }: UserMapProps) {
  const total = signups.length;
  const real = realCityCounts(signups);
  const counts = real ?? mockCityCounts(total);
  const isEstimate = !real;
  const grandTotal = counts.reduce((sum, c) => sum + c.count, 0) || 1;
  const topCity = counts.reduce((top, c) => (c.count > top.count ? c : top), counts[0]);

  return (
    <Card
      className={`border-[#1f2a37] bg-[#151B2C] transition hover:shadow-[0_0_24px_rgba(0,255,136,0.12)] ${className ?? ""}`}
    >
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-white">
          <Globe2 className="h-4 w-4 text-taxlaya-green" />
          User Locations 🌍
        </CardTitle>
        {isEstimate && (
          <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-400 ring-1 ring-inset ring-amber-500/30">
            Estimated
          </span>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {counts.map((c) => {
          const pct = Math.round((c.count / grandTotal) * 100);
          const isTop = c.city === topCity.city && c.count > 0;
          return (
            <div key={c.city}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="flex items-center gap-1.5 font-medium text-gray-200">
                  {c.city}
                  {isTop && (
                    <span className="rounded-full bg-taxlaya-green/15 px-1.5 py-0.5 text-[10px] font-semibold text-taxlaya-green">
                      Top City
                    </span>
                  )}
                </span>
                <span className="text-gray-400">
                  {c.count} · {pct}%
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-gray-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-taxlaya-green to-emerald-400 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
        {isEstimate && (
          <p className="pt-1 text-[11px] text-gray-500">
            No location data on signups yet — showing a demo distribution based on {total} total signup
            {total === 1 ? "" : "s"}.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
