"use client";

import { useMemo, useState } from "react";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { WaitlistRow } from "@/lib/supabase/admin";

const PAGE_SIZE = 20;

function hateBadgeVariant(level: number): "success" | "warning" | "destructive" {
  if (level <= 3) return "success";
  if (level <= 7) return "warning";
  return "destructive";
}

export function WaitlistTable({ signups }: { signups: WaitlistRow[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return signups;
    return signups.filter((s) => s.email.toLowerCase().includes(query));
  }, [search, signups]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between gap-4 space-y-0 sm:flex-row">
        <CardTitle className="text-base font-semibold text-white">
          Waitlist ({filtered.length})
        </CardTitle>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by email..."
            className="pl-9"
          />
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Email</TableHead>
              <TableHead>BIR Hate Level</TableHead>
              <TableHead>Date Joined</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="py-8 text-center text-slate-500">
                  No signups found.
                </TableCell>
              </TableRow>
            ) : (
              pageRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-slate-100">{row.email}</TableCell>
                  <TableCell>
                    <Badge variant={hateBadgeVariant(row.bir_hate_level)}>
                      {row.bir_hate_level}/10
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-400">
                    {new Date(row.created_at).toLocaleString("en-PH", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
          <span>
            Page {currentPage} of {pageCount}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
              Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              disabled={currentPage >= pageCount}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
