import { DollarSign, TrendingUp, Users, AlertTriangle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PaymentsStats } from "@/lib/payments-stats";

const PESO = (n: number) => `₱${Math.round(n).toLocaleString()}`;

export function PaymentsStatsCards({ stats }: { stats: PaymentsStats }) {
  const cards = [
    { label: "Total Revenue", value: PESO(stats.totalRevenue), icon: DollarSign },
    { label: "MRR", value: PESO(stats.mrr), icon: TrendingUp },
    { label: "Active Paid Users", value: stats.activePaidUsers.toLocaleString(), icon: Users },
    { label: "Failed Payments", value: stats.failedPayments.toLocaleString(), icon: AlertTriangle },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((stat) => (
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
