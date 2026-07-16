"use client";

import { MessageCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { blurIp, recentChats } from "@/lib/chat-analytics";
import type { ChatMessageRow } from "@/lib/supabase/admin";

export function RecentChatsFeed({ chatMessages }: { chatMessages: ChatMessageRow[] }) {
  const rows = recentChats(chatMessages, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-white">Live Chat Feed</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-gray-500">No conversations yet.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((chat) => (
              <li
                key={`${chat.ip}-${chat.timestamp}`}
                className="flex items-start gap-3 rounded-lg bg-gray-800/50 p-3"
              >
                <MessageCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-taxlaya-green" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-gray-500">{blurIp(chat.ip)}</span>
                    <span className="flex-shrink-0 text-xs text-gray-500">
                      {new Date(chat.timestamp).toLocaleString("en-PH", {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                  <p className="mt-0.5 truncate text-sm text-gray-200">{chat.firstQuestion}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
