"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { WaitlistRow } from "@/lib/supabase/admin";

const LEVEL_EMOJI: Record<number, string> = {
  1: "😌",
  2: "🙂",
  3: "😐",
  4: "😕",
  5: "😠",
  6: "😤",
  7: "😡",
  8: "🤬",
  9: "💀",
  10: "🔥",
};

const PIE_COLORS = [
  "#22C55E",
  "#4ADE80",
  "#84CC16",
  "#EAB308",
  "#F59E0B",
  "#F97316",
  "#EF4444",
  "#DC2626",
  "#B91C1C",
  "#7F1D1D",
];

interface HateLevelDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  signups: WaitlistRow[];
}

export function HateLevelDialog({ open, onOpenChange, signups }: HateLevelDialogProps) {
  const counts = Array.from({ length: 10 }, (_, i) => i + 1).map((level) => ({
    level,
    count: signups.filter((s) => s.bir_hate_level === level).length,
  }));

  const chartData = counts
    .filter((c) => c.count > 0)
    .map((c) => ({ name: `Level ${c.level}`, value: c.count, level: c.level }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>BIR Hate Level breakdown</DialogTitle>
          <DialogDescription>
            How {signups.length} signups rated "gaano ka-hassle ang BIR sa'yo?" (1-10).
          </DialogDescription>
        </DialogHeader>

        {chartData.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No signups yet.</p>
        ) : (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={chartData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={2}
                >
                  {chartData.map((entry) => (
                    <Cell key={entry.level} fill={PIE_COLORS[entry.level - 1]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    background: "#0f172a",
                    border: "1px solid #1e293b",
                    borderRadius: 8,
                    color: "#e2e8f0",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-sm">
          {counts.map((c) => (
            <div
              key={c.level}
              className="flex items-center justify-between rounded-lg bg-gray-800/60 px-3 py-1.5"
            >
              <span className="text-gray-300">
                {LEVEL_EMOJI[c.level]} Level {c.level}
              </span>
              <span className="font-semibold text-white">
                {c.count} {c.count === 1 ? "user" : "users"}
              </span>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
