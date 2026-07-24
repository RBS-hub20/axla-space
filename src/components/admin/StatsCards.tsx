import {
  Flame,
  Mail,
  CalendarDays,
  CalendarRange,
  MessageCircle,
  Users,
  TrendingUp,
  FileText,
  Receipt,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { mostAskedForm } from "@/lib/chat-analytics";
import type { ChatMessageRow, WaitlistRow } from "@/lib/supabase/admin";

function isSameDay(a: Date, b: Date) {
  return a.toDateString() === b.toDateString();
}

interface StatsCardsProps {
  signups: WaitlistRow[];
  chatMessages: ChatMessageRow[];
  onHateLevelClick: () => void;
  totalInvoices?: number | null;
}

export function StatsCards({ signups, chatMessages, onHateLevelClick, totalInvoices }: StatsCardsProps) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const total = signups.length;
  const avgHate = total === 0 ? 0 : signups.reduce((sum, s) => sum + s.bir_hate_level, 0) / total;
  const today = signups.filter((s) => isSameDay(new Date(s.created_at), now)).length;
  const thisWeek = signups.filter((s) => new Date(s.created_at) >= weekAgo).length;

  const totalMessages = chatMessages.length;
  const activeUsersToday = new Set(
    chatMessages.filter((m) => isSameDay(new Date(m.created_at), now)).map((m) => m.ip),
  ).size;
  const avgMessagesPerUser = total === 0 ? 0 : totalMessages / total;
  const topForm = mostAskedForm(chatMessages);

  const stats = [
    { label: "Total Signups", value: total.toLocaleString(), icon: Mail },
    {
      label: "Average BIR Hate Level",
      value: `${avgHate.toFixed(1)} 🔥`,
      icon: Flame,
      onClick: onHateLevelClick,
    },
    { label: "Signups Today", value: today.toLocaleString(), icon: CalendarDays },
    { label: "Signups This Week", value: thisWeek.toLocaleString(), icon: CalendarRange },
    { label: "Total Messages", value: totalMessages.toLocaleString(), icon: MessageCircle },
    { label: "Active Users Today", value: activeUsersToday.toLocaleString(), icon: Users },
    { label: "Avg Messages per User", value: avgMessagesPerUser.toFixed(1), icon: TrendingUp },
    { label: "Most Asked Form", value: topForm, icon: FileText },
    ...(totalInvoices !== null && totalInvoices !== undefined
      ? [{ label: "Invoices Created", value: totalInvoices.toLocaleString(), icon: Receipt }]
      : []),
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat) => (
        <Card
          key={stat.label}
          onClick={stat.onClick}
          className={stat.onClick ? "cursor-pointer" : undefined}
        >
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
