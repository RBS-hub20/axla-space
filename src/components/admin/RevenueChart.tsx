"use client";

import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { RevenueDay } from "@/lib/payments-stats";

export function RevenueChart({ data }: { data: RevenueDay[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-white">Revenue — Last 30 Days</CardTitle>
      </CardHeader>
      <CardContent className="h-72 pl-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00FF88" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#00FF88" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="date"
              tick={{ fill: "#64748b", fontSize: 12 }}
              interval="preserveStartEnd"
              tickLine={false}
              axisLine={{ stroke: "#1e293b" }}
            />
            <YAxis
              tick={{ fill: "#64748b", fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "#1e293b" }}
              width={52}
              tickFormatter={(value: number) => `₱${value}`}
            />
            <Tooltip
              contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, color: "#e2e8f0" }}
              labelStyle={{ color: "#94a3b8" }}
              formatter={(value: number) => [`₱${value.toLocaleString()}`, "Revenue"]}
            />
            <Area
              type="monotone"
              dataKey="amount"
              name="Revenue"
              stroke="#00FF88"
              strokeWidth={2}
              fill="url(#revenueGradient)"
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
