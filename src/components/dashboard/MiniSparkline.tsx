"use client";

import { useId } from "react";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer } from "recharts";

interface MiniSparklineProps {
  data: { value: number }[];
  variant: "area" | "bar";
  color: string;
}

export function MiniSparkline({ data, variant, color }: MiniSparklineProps) {
  const gradientId = useId();

  if (variant === "bar") {
    return (
      <ResponsiveContainer width="100%" height={36}>
        <BarChart data={data}>
          <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={36}>
      <AreaChart data={data}>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.4} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${gradientId})`} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
