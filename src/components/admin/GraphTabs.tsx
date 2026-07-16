"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { ChatMessageRow, WaitlistRow } from "@/lib/supabase/admin";

function buildDailySeries<T>(rows: T[], getDate: (row: T) => string, days: number) {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const key = new Date(getDate(row)).toDateString();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const series: { date: string; count: number }[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    const key = day.toDateString();
    series.push({
      date: day.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      count: counts.get(key) ?? 0,
    });
  }

  return series;
}

const tooltipStyle = {
  contentStyle: {
    background: "#0f172a",
    border: "1px solid #1e293b",
    borderRadius: 8,
    color: "#e2e8f0",
  },
  labelStyle: { color: "#94a3b8" },
};

interface GraphTabsProps {
  signups: WaitlistRow[];
  chatMessages: ChatMessageRow[];
  days: number;
}

export function GraphTabs({ signups, chatMessages, days }: GraphTabsProps) {
  const [tab, setTab] = useState<"signups" | "chat">("signups");

  const signupSeries = buildDailySeries(signups, (s) => s.created_at, days);
  const chatSeries = buildDailySeries(chatMessages, (m) => m.created_at, days);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base font-semibold text-white">
          {tab === "signups" ? "Signups" : "Chat Activity"}
        </CardTitle>
        <div className="flex gap-1 rounded-lg bg-gray-800 p-1">
          <button
            type="button"
            onClick={() => setTab("signups")}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition",
              tab === "signups" ? "bg-taxlaya-green text-gray-950" : "text-gray-400 hover:text-gray-200",
            )}
          >
            Signups
          </button>
          <button
            type="button"
            onClick={() => setTab("chat")}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition",
              tab === "chat" ? "bg-taxlaya-green text-gray-950" : "text-gray-400 hover:text-gray-200",
            )}
          >
            Chat Activity
          </button>
        </div>
      </CardHeader>
      <CardContent className="h-72 pl-0">
        <ResponsiveContainer width="100%" height="100%">
          {tab === "signups" ? (
            <BarChart data={signupSeries} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="signupGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22C55E" stopOpacity={1} />
                  <stop offset="100%" stopColor="#22C55E" stopOpacity={0.3} />
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
                allowDecimals={false}
                tick={{ fill: "#64748b", fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: "#1e293b" }}
                width={32}
              />
              <Tooltip {...tooltipStyle} formatter={(value: number) => [value, "Signups"]} />
              <Bar dataKey="count" name="Signups" fill="url(#signupGradient)" radius={[4, 4, 0, 0]} />
            </BarChart>
          ) : (
            <AreaChart data={chatSeries} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="chatGradient" x1="0" y1="0" x2="0" y2="1">
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
                allowDecimals={false}
                tick={{ fill: "#64748b", fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: "#1e293b" }}
                width={32}
              />
              <Tooltip {...tooltipStyle} formatter={(value: number) => [value, "Messages"]} />
              <Area
                type="monotone"
                dataKey="count"
                name="Messages"
                stroke="#00FF88"
                strokeWidth={2}
                fill="url(#chatGradient)"
                activeDot={{ r: 4 }}
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
