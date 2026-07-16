"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { blurIp, classifySentiment, recentChats, type Sentiment } from "@/lib/chat-analytics";
import type { ChatMessageRow } from "@/lib/supabase/admin";

const MOOD_EMOJI: Record<Sentiment, string> = {
  positive: "😊",
  neutral: "😐",
  frustrated: "😤",
};

const MOOD_LABEL: Record<Sentiment, string> = {
  positive: "Positive",
  neutral: "Neutral",
  frustrated: "Frustrated",
};

export function RecentChatsFeed({ chatMessages }: { chatMessages: ChatMessageRow[] }) {
  const rows = recentChats(chatMessages, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-white">Live Chat Feed</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>IP</TableHead>
              <TableHead>First Question</TableHead>
              <TableHead>Timestamp</TableHead>
              <TableHead className="text-center">Mood</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="py-8 text-center text-gray-500">
                  No conversations yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((chat) => {
                const mood = classifySentiment(chat.firstQuestion);
                return (
                  <TableRow key={`${chat.ip}-${chat.timestamp}`}>
                    <TableCell className="font-mono text-xs text-gray-400">
                      {blurIp(chat.ip)}
                    </TableCell>
                    <TableCell className="max-w-xs truncate text-gray-100">
                      {chat.firstQuestion}
                    </TableCell>
                    <TableCell className="text-gray-400">
                      {new Date(chat.timestamp).toLocaleString("en-PH", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell className="text-center text-lg" title={MOOD_LABEL[mood]}>
                      {MOOD_EMOJI[mood]}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
