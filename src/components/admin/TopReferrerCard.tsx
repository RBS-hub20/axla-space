import { Trophy } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReferralStats } from "@/app/api/referral/stats/route";

interface TopReferrerCardProps {
  stats: ReferralStats | null;
  className?: string;
}

export function TopReferrerCard({ stats, className }: TopReferrerCardProps) {
  const top = stats?.topReferrer ?? null;

  return (
    <Card
      className={`border-[#1f2a37] bg-[#151B2C] transition hover:shadow-[0_0_24px_rgba(0,255,136,0.12)] ${className ?? ""}`}
    >
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold text-white">
          <Trophy className="h-4 w-4 text-taxlaya-green" />
          Top Referrer 🏆
        </CardTitle>
      </CardHeader>
      <CardContent className="flex h-full flex-col justify-center">
        {top ? (
          <>
            <p className="truncate text-lg font-bold text-white">{top.email}</p>
            <p className="mt-1 text-sm text-taxlaya-green">
              {top.count} referral{top.count === 1 ? "" : "s"}
            </p>
          </>
        ) : (
          <p className="text-sm text-gray-500">No referrals yet</p>
        )}
      </CardContent>
    </Card>
  );
}
