"use client";

import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { messagesByHour } from "@/lib/chat-analytics";
import type { ChatMessageRow } from "@/lib/supabase/admin";

function formatHour(hour: number): string {
  if (hour === 0) return "12AM";
  if (hour === 12) return "12PM";
  return hour < 12 ? `${hour}AM` : `${hour - 12}PM`;
}

/** Green intensity scales with volume relative to the busiest hour, so the bars read as a heatmap. */
function intensityColor(count: number, max: number): string {
  if (max === 0 || count === 0) return "#1f2937";
  const ratio = count / max;
  const lightness = 45 - ratio * 25;
  return `hsl(152, 100%, ${lightness}%)`;
}

export function PeakHoursCard({ chatMessages }: { chatMessages: ChatMessageRow[] }) {
  const data = messagesByHour(chatMessages).map((bucket) => ({
    ...bucket,
    label: formatHour(bucket.hour),
  }));
  const max = Math.max(0, ...data.map((d) => d.count));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-white">Peak Hours</CardTitle>
        <p className="text-xs text-gray-500">Message volume by hour of day</p>
      </CardHeader>
      <CardContent className="h-64 pl-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fill: "#64748b", fontSize: 10 }}
              interval={1}
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
              formatter={(value: number) => [value, "Messages"]}
            />
            <Bar dataKey="count" name="Messages" radius={[3, 3, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.hour} fill={intensityColor(entry.count, max)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
