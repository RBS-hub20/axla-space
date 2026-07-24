"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface RegistrationRow {
  id: string;
  type: "OPEN" | "CLOSE" | "SPA" | "DTI" | "SEC" | "MAYORS";
  status: string;
  created_at: string;
  owner_email: string | null;
  business_name: string;
}

interface Counts {
  dti: number;
  sec: number;
  mayors: number;
  open: number;
  close: number;
  spa: number;
}

export function ComplianceTable() {
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/admin/business-registrations", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data) {
          setRegistrations(data.registrations ?? []);
          setCounts(data.counts ?? null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-4">
      {counts && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <CountBox label="DTI" value={counts.dti} />
          <CountBox label="SEC" value={counts.sec} />
          <CountBox label="Mayor's" value={counts.mayors} />
          <CountBox label="Open Biz" value={counts.open} />
          <CountBox label="Close Biz" value={counts.close} />
          <CountBox label="SPA" value={counts.spa} />
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex items-center justify-center p-8 text-gray-500">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : registrations.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-500">No Business Toolkit kits generated yet, across any account.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-left text-xs uppercase tracking-wide text-gray-500">
                    <th className="px-4 py-3">Business Name</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">On File</th>
                    <th className="px-4 py-3">Date</th>
                    <th className="px-4 py-3">Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {registrations.map((r) => {
                    const isAxla = r.business_name.toUpperCase().includes("AXLA");
                    return (
                      <tr key={r.id} className="border-b border-gray-800/60 last:border-0">
                        <td className="px-4 py-3 font-medium text-white">
                          <div className="flex items-center gap-2">
                            {r.business_name}
                            {isAxla && (
                              <span className="flex items-center gap-1 rounded-full bg-[#00FF88]/15 px-2 py-0.5 text-[10px] font-bold uppercase text-[#00FF88]">
                                <ShieldCheck className="h-3 w-3" />
                                CERTIFIED — BNRS 8/8 PASSED
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="default">{r.type}</Badge>
                        </td>
                        <td className="px-4 py-3 text-gray-400">{r.status}</td>
                        <td className="px-4 py-3 text-gray-500">{new Date(r.created_at).toLocaleDateString("en-PH")}</td>
                        <td className="px-4 py-3 text-gray-500">{r.owner_email ?? "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-gray-500">
        &ldquo;On File&rdquo; reflects this app&apos;s own record that a kit was generated — Axla has no live BIR/DTI/SEC verification API,
        so this isn&apos;t an automated government validation result. The BNRS 8/8 PASSED badge reflects the account owner&apos;s own
        reported DTI registration status for Axla&apos;s business name.
      </p>
    </div>
  );
}

function CountBox({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4 text-center">
        <p className="text-2xl font-bold text-white">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </CardContent>
    </Card>
  );
}
