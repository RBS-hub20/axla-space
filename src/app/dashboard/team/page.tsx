"use client";

import { useCallback, useEffect, useState } from "react";
import { Lock, Info } from "lucide-react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface Invite {
  id: string;
  invited_email: string;
  role: string;
  status: "pending" | "accepted" | "revoked";
  created_at: string;
}

export default function TeamPage() {
  const [invites, setInvites] = useState<Invite[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "accountant">("accountant");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/dashboard/team", { cache: "no-store" });
      const data = await res.json();
      if (res.status === 403 && data.code === "LIMIT_REACHED") {
        setLocked(true);
        return;
      }
      if (res.ok) setInvites(data.invites);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setIsSending(true);
    try {
      const res = await fetch("/api/dashboard/team", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to send invite.");
        return;
      }
      setNotice(`Invited ${email}.`);
      setEmail("");
      await load();
    } catch {
      setError("Network error.");
    } finally {
      setIsSending(false);
    }
  }

  if (isLoading) {
    return <p className="text-sm text-slate-400">Loading...</p>;
  }

  if (locked) {
    return (
      <div className="mx-auto max-w-md space-y-4 py-16 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/5">
          <Lock className="h-5 w-5 text-white" />
        </div>
        <h1 className="text-xl font-bold text-white">Team invites are a Business feature</h1>
        <p className="text-sm text-slate-400">
          Upgrade to Business (₱1,499/mo) to invite your accountant or VA — up to 5 team members.
        </p>
        <Link
          href="/dashboard/settings"
          className="inline-block rounded-full bg-[#00FF85] px-6 py-3 text-sm font-semibold text-[#001A29] hover:bg-[#00e078]"
        >
          Upgrade to Business
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-white">Team</h1>

      <div className="flex items-start gap-2 rounded-lg border border-amber-900/50 bg-amber-950/30 px-4 py-3 text-sm text-amber-200">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Invites send a real email, but shared account access isn&apos;t live yet — an invited
          accountant/VA can&apos;t log in and view your filings until that's built. Use this to line up
          who you'll add once it is.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Invite someone</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleInvite} className="flex flex-col gap-3 sm:flex-row">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="accountant@email.com"
              className="flex-1"
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "member" | "accountant")}
              className="h-10 rounded-lg border border-slate-700 bg-slate-900 px-3 text-sm text-slate-100"
            >
              <option value="accountant">Accountant</option>
              <option value="member">Team member</option>
            </select>
            <Button type="submit" disabled={isSending}>
              {isSending ? "Sending..." : "Invite"}
            </Button>
          </form>
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
          {notice && <p className="mt-2 text-sm text-[#00FF85]">{notice}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invited ({invites.length}/5)</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {invites.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="py-8 text-center text-slate-500">
                    No invites yet.
                  </TableCell>
                </TableRow>
              ) : (
                invites.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="text-slate-200">{i.invited_email}</TableCell>
                    <TableCell className="text-slate-400 capitalize">{i.role}</TableCell>
                    <TableCell>
                      <Badge variant={i.status === "accepted" ? "success" : i.status === "revoked" ? "destructive" : "warning"}>
                        {i.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-slate-400">
                      {new Date(i.created_at).toLocaleDateString("en-PH", { month: "short", day: "numeric" })}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
