"use client";

import Link from "next/link";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { MonthlyFinancial } from "@/lib/dashboard/overview";

const PESO = (n: number) => `₱${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

interface RevenueTimelineChartProps {
  months: MonthlyFinancial[];
  hasData: boolean;
}

export function RevenueTimelineChart({ months, hasData }: RevenueTimelineChartProps) {
  if (!hasData) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-center">
        <span className="text-4xl">📈</span>
        <p className="text-sm text-gray-400">Upload GCash to see chart 📈</p>
        <Link href="/dashboard/upload" className="mt-1 text-xs font-medium text-[#22c55e] hover:underline">
          Upload GCash history →
        </Link>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={260}>
      <AreaChart data={months} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
        <defs>
          <linearGradient id="revenueTimelineFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="#1E293B" strokeDasharray="3 3" vertical={false} />
        <XAxis dataKey="label" stroke="#64748b" fontSize={12} tickLine={false} axisLine={false} />
        <YAxis
          stroke="#64748b"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          width={48}
          tickFormatter={(v: number) => `₱${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`}
        />
        <Tooltip
          contentStyle={{ background: "#121A22", border: "1px solid #1E293B", borderRadius: 12, fontSize: 12 }}
          labelStyle={{ color: "#e2e8f0" }}
          itemStyle={{ color: "#e2e8f0" }}
          formatter={(value: number, name: string) => [PESO(value), name === "income" ? "Income" : "Expenses"]}
        />
        <Area
          type="monotone"
          dataKey="income"
          name="income"
          stroke="#22c55e"
          strokeWidth={2}
          fill="url(#revenueTimelineFill)"
          activeDot={{ r: 4 }}
        />
        <Area
          type="monotone"
          dataKey="expenses"
          name="expenses"
          stroke="#f59e0b"
          strokeWidth={2}
          strokeDasharray="4 4"
          fill="none"
          activeDot={{ r: 4 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
