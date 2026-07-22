"use client";

import { Smartphone, CreditCard, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { RecentPayment } from "@/lib/payments-stats";

const METHOD_INFO: Record<string, { icon: typeof Smartphone; label: string; color: string }> = {
  gcash: { icon: Smartphone, label: "GCash", color: "text-blue-400" },
  maya: { icon: Smartphone, label: "Maya", color: "text-emerald-400" },
  card: { icon: CreditCard, label: "Card", color: "text-slate-300" },
};

function methodInfo(method: string | null) {
  return METHOD_INFO[method ?? ""] ?? { icon: Wallet, label: "Other", color: "text-slate-400" };
}

function statusVariant(status: string): "success" | "warning" | "destructive" {
  if (status === "paid") return "success";
  if (status === "pending") return "warning";
  return "destructive";
}

export function RecentPaymentsFeed({ payments }: { payments: RecentPayment[] }) {
  const rows = payments.slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold text-white">Recent Payments</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Method</TableHead>
              <TableHead>Email</TableHead>
              <TableHead>Amount</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Date</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-gray-500">
                  No payments yet.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((p) => {
                const method = methodInfo(p.paymentMethod);
                const Icon = method.icon;
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <span className={`flex items-center gap-1.5 ${method.color}`}>
                        <Icon className="h-4 w-4" />
                        {method.label}
                      </span>
                    </TableCell>
                    <TableCell className="text-gray-100">{p.email}</TableCell>
                    <TableCell className="font-medium text-taxlaya-green">
                      {p.currency} {p.amount.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-gray-400 capitalize">{p.provider}</TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(p.status)}>{p.status}</Badge>
                    </TableCell>
                    <TableCell className="text-gray-400">
                      {new Date(p.createdAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
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
