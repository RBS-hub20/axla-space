import { Flame, Mail, CalendarDays, CalendarRange } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WaitlistRow } from "@/lib/supabase/admin";

function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

export function StatsCards({ signups }: { signups: WaitlistRow[] }) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const total = signups.length;
  const avgHate =
    total === 0
      ? 0
      : signups.reduce((sum, s) => sum + s.bir_hate_level, 0) / total;
  const today = signups.filter((s) => isSameDay(new Date(s.created_at), now)).length;
  const thisWeek = signups.filter((s) => new Date(s.created_at) >= weekAgo).length;

  const stats = [
    { label: "Total Signups", value: total.toLocaleString(), icon: Mail },
    { label: "Average BIR Hate Level", value: `${avgHate.toFixed(1)} 🔥`, icon: Flame },
    { label: "Signups Today", value: today.toLocaleString(), icon: CalendarDays },
    { label: "Signups This Week", value: thisWeek.toLocaleString(), icon: CalendarRange },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card key={stat.label}>
          <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle>{stat.label}</CardTitle>
            <stat.icon className="h-4 w-4 text-accent" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-white">{stat.value}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
