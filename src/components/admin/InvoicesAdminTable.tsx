"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface AdminInvoice {
  id: string;
  invoice_number: string;
  client_name: string;
  total: number;
  currency: string;
  status: "draft" | "sent" | "paid";
  created_at: string;
  owner_email: string | null;
}

interface InvoicesStats {
  totalInvoiced: number;
  outstanding: number;
  paid: number;
  count: number;
}

const PESO = (n: number, currency = "PHP") => `${currency} ${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

function statusBadge(status: AdminInvoice["status"]) {
  if (status === "paid") return <Badge variant="success">Paid</Badge>;
  if (status === "sent") return <Badge variant="warning">Sent</Badge>;
  return <Badge variant="default">Draft</Badge>;
}

export function InvoicesAdminTable() {
  const [invoices, setInvoices] = useState<AdminInvoice[]>([]);
  const [stats, setStats] = useState<InvoicesStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/invoices", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setInvoices(data.invoices ?? []);
          setStats(data.stats ?? null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      {stats && (
        <div className="grid gap-4 sm:grid-cols-3">
          <StatBox label="Total Invoiced" value={PESO(stats.totalInvoiced)} />
          <StatBox label="Outstanding" value={PESO(stats.outstanding)} accent="amber" />
          <StatBox label="Paid" value={PESO(stats.paid)} accent="green" />
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center p-8 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : invoices.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">No invoices created yet, across any account.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3">Invoice #</th>
                    <th className="px-4 py-3">Client</th>
                    <th className="px-4 py-3">Owner</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">EIS</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-gray-800/60 last:border-0">
                      <td className="px-4 py-3 font-medium text-white">{inv.invoice_number}</td>
                      <td className="px-4 py-3 text-gray-300">{inv.client_name}</td>
                      <td className="px-4 py-3 text-gray-500">{inv.owner_email ?? "—"}</td>
                      <td className="px-4 py-3 text-gray-300">{PESO(inv.total, inv.currency)}</td>
                      <td className="px-4 py-3">{statusBadge(inv.status)}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-[#00FF88]/10 px-2 py-0.5 text-[10px] font-bold uppercase text-[#00FF88]">Ready</span>
                      </td>
                      <td className="px-4 py-3 text-gray-500">{new Date(inv.created_at).toLocaleDateString("en-PH")}</td>
                      <td className="px-4 py-3">
                        <a
                          href={`/api/admin/invoices/${inv.id}/pdf`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                        >
                          <Download className="h-3.5 w-3.5" />
                          View PDF
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatBox({ label, value, accent }: { label: string; value: string; accent?: "green" | "amber" }) {
  const color = accent === "green" ? "text-[#00FF88]" : accent === "amber" ? "text-amber-400" : "text-white";
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs font-medium text-gray-500">{label}</p>
        <p className={`mt-1 text-lg font-bold ${color}`}>{value}</p>
      </CardContent>
    </Card>
  );
}
