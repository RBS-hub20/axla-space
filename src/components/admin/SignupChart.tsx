"use client";

import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { WaitlistRow } from "@/lib/supabase/admin";

function buildLast30DaysSeries(signups: WaitlistRow[]) {
  const days: { date: string; count: number }[] = [];
  const counts = new Map<string, number>();

  for (const signup of signups) {
    const key = new Date(signup.created_at).toDateString();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const today = new Date();
  for (let i = 29; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    const key = day.toDateString();
    days.push({
      date: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count: counts.get(key) ?? 0,
    });
  }

  return days;
}

export function SignupChart({ signups }: { signups: WaitlistRow[] }) {
  const data = buildLast30DaysSeries(signups);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-white">
          Signups — last 30 days
        </CardTitle>
      </CardHeader>
      <CardContent className="h-72 pl-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="date"
              tick={{ fill: "#64748b", fontSize: 12 }}
              interval="preserveStartEnd"
              tickLine={false}
              axisLine={{ stroke: "#1e293b" }}
            />
            <YAxis
              allowDecimals={false}
              tick={{ fill: "#64748b", fontSize: 12 }}
              tickLine={false}
              axisLine={{ stroke: "#1e293b" }}
              width={32}
            />
            <Tooltip
              contentStyle={{
                background: "#0f172a",
                border: "1px solid #1e293b",
                borderRadius: 8,
                color: "#e2e8f0",
              }}
              labelStyle={{ color: "#94a3b8" }}
            />
            <Line
              type="monotone"
              dataKey="count"
              name="Signups"
              stroke="#22C55E"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
