"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { topQuestions } from "@/lib/chat-analytics";
import type { ChatMessageRow } from "@/lib/supabase/admin";

export function TopQuestionsTable({ chatMessages }: { chatMessages: ChatMessageRow[] }) {
  const rows = topQuestions(chatMessages, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-white">
          Top 10 User Questions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Question</TableHead>
              <TableHead>Count</TableHead>
              <TableHead>Last Asked</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-gray-500">
                  No chat questions logged yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.question}>
                  <TableCell className="max-w-md truncate font-medium text-gray-100">
                    {row.question}
                  </TableCell>
                  <TableCell className="text-taxlaya-green">{row.count}</TableCell>
                  <TableCell className="text-gray-400">
                    {new Date(row.lastAsked).toLocaleDateString("en-PH", {
                      month: "short",
                      day: "numeric",
                    })}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
