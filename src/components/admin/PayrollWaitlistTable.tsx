"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { SubscriptionSummary } from "@/lib/payments-stats";
import type { WaitlistRow } from "@/lib/supabase/admin";

function subStatusBadgeVariant(status: string): "default" | "success" | "warning" | "destructive" {
  if (status === "active") return "success";
  if (status === "past_due") return "warning";
  if (status === "canceled") return "destructive";
  return "default";
}

function planLabel(plan: string): string {
  // "payroll_business" -> "Business", etc.
  const tier = plan.replace("payroll_", "");
  return tier.charAt(0).toUpperCase() + tier.slice(1);
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });
}

interface PayrollSubscriber {
  email: string;
  summary: SubscriptionSummary;
}

/**
 * Same column set as the TaxLaya Waitlist tab, but the base list is Payroll
 * subscribers (payments.payments.payroll.subscriptionsByEmail, already
 * pre-filtered to payroll_* plans) rather than waitlist signups — a
 * Payroll purchase's synthetic axla-payroll+{timestamp}@axla.space email
 * almost never matches a real waitlist row, so BIR Hate Level shows "—" for
 * most/all rows here; that's expected, not a bug (see the webhook's payroll
 * branch docstring for why the email is synthetic).
 */
export function PayrollWaitlistTable({
  subscriptionsByEmail,
  waitlistSignups = [],
}: {
  subscriptionsByEmail: Record<string, SubscriptionSummary>;
  waitlistSignups?: WaitlistRow[];
}) {
  const [search, setSearch] = useState("");

  const rows: PayrollSubscriber[] = useMemo(
    () =>
      Object.entries(subscriptionsByEmail)
        .map(([email, summary]) => ({ email, summary }))
        .sort((a, b) => new Date(b.summary.createdAt).getTime() - new Date(a.summary.createdAt).getTime()),
    [subscriptionsByEmail],
  );

  const waitlistByEmail = useMemo(() => {
    const map = new Map<string, WaitlistRow>();
    for (const w of waitlistSignups) map.set(w.email.toLowerCase(), w);
    return map;
  }, [waitlistSignups]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return rows;
    return rows.filter((r) => r.email.toLowerCase().includes(query));
  }, [search, rows]);

  return (
    <Card>
      <CardHeader className="flex-col gap-3 space-y-0 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-base font-semibold text-white">Payroll Subscribers ({filtered.length})</CardTitle>
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by email..." className="pl-9" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>BIR Hate Level</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Sub Status</TableHead>
                <TableHead>Last Payment</TableHead>
                <TableHead>Next Billing</TableHead>
                <TableHead>Date Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-slate-500">
                    No Payroll subscribers yet.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((row) => {
                  const waitlistMatch = waitlistByEmail.get(row.email.toLowerCase());
                  return (
                    <TableRow key={row.email}>
                      <TableCell className="font-medium text-slate-100">{row.email}</TableCell>
                      <TableCell>
                        {waitlistMatch ? <Badge variant="default">{waitlistMatch.bir_hate_level}/10</Badge> : <span className="text-slate-500">—</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="success">{planLabel(row.summary.plan)}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={subStatusBadgeVariant(row.summary.status)}>{row.summary.status}</Badge>
                      </TableCell>
                      <TableCell className="text-slate-400">{formatDate(row.summary.lastPayment)}</TableCell>
                      <TableCell className="text-slate-400">{formatDate(row.summary.nextBilling)}</TableCell>
                      <TableCell className="text-slate-400">{formatDate(row.summary.createdAt)}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
